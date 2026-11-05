let editor;
let conn = null;
let baseUrl = null;
let sessionId = null;
let logsIdArray = null;
let userRecords = null;
let rawLogData = '';
let currentLogId = null;
let selectedEventsSet = new Set();
let knownEventsSet = new Set(); // events we have already seen (used to auto-select newly appearing events)
let sessionLogsCache = new Map(); // Key: logId => { metadata, body, fetchedAt }
let isLoadingOlderLogs = false;
let orgDisplayName = '';
let orgEnvironment = 'Production';

let orgApexClassesMap = new Map(); // Key: lowercased class/trigger name => { id, name, namespace, isTrigger }
let currentLoadedApexRecord = null;
let apexClassAceEditor = null;

const BUILTIN_APEX_TYPES = new Set([
    'system', 'database', 'schema', 'string', 'integer', 'boolean', 'decimal', 'double', 'long',
    'date', 'datetime', 'time', 'id', 'blob', 'object', 'list', 'set', 'map', 'pagereference',
    'selectoption', 'test', 'json', 'http', 'httprequest', 'httpresponse', 'limits', 'userinfo',
    'math', 'crypto', 'eventbus', 'trigger', 'exception', 'apexpages', 'messaging', 'restcontext',
    'restrequest', 'restresponse', 'webservicemock', 'httpcalloutmock', 'sobject',
    'url', 'querylocator', 'querylocatoriterator', 'pattern', 'matcher', 'encodingutil',
    'search', 'reports', 'auth', 'canvas', 'chatter', 'connectapi', 'approval', 'quickaction',
    'site', 'network', 'wave', 'commerce', 'event', 'bus', 'location', 'address',
    'xmlstreamreader', 'xmlstreamwriter', 'dom', 'cookie', 'component', 'type',
    'continuation', 'multistaticresourcecalloutmock', 'ideastandardcontroller',
    'standardcontroller', 'standardsetcontroller', 'flexqueue', 'queueable', 'schedulable',
    'batchable', 'batchablecontext', 'schedulablecontext', 'queueablecontext',
    'savepoint', 'dmlexception', 'nullpointerexception', 'queryexception', 'calloutexception',
    'listexception', 'mathexception', 'jsonexception', 'visualforceexception', 'asyncexception',
    'handledexception', 'stringexception', 'serializationexception', 'securityexception',
    'illegalargumentexception', 'invalidparametervalueexception', 'nosuchelementexception',
    'noaccessexception', 'searchexception', 'typeexception'
]);

function isBuiltinApexType(name) {
    if (!name) return false;
    return BUILTIN_APEX_TYPES.has(String(name).toLowerCase());
}

let lastScannedLogId = null;
let _cachedOrgClassesRegex = null;

function invalidateOrgClassesCache() {
    _cachedOrgClassesRegex = null;
}

function getCachedOrgClassesRegex() {
    if (_cachedOrgClassesRegex) return _cachedOrgClassesRegex;
    const names = Array.from(orgApexClassesMap.values()).map(o => o.name).filter(Boolean);
    const pattern = names.length ? '\\b(' + names.join('|') + ')\\b' : '';
    _cachedOrgClassesRegex = pattern
        ? new RegExp('(Class\\.)([A-Za-z0-9_]+)(?:\\.([A-Za-z0-9_<>]+))?|(01[pq][A-Za-z0-9]{12,15}\\|)([A-Za-z0-9_]+)|' + pattern, 'gi')
        : /(Class\.)([A-Za-z0-9_]+)(?:\\.([A-Za-z0-9_<>]+))?|(01[pq][A-Za-z0-9]{12,15}\\|)([A-Za-z0-9_]+)/g;
    return _cachedOrgClassesRegex;
}

/**
 * Scans log content for 01p ApexClass IDs and class names,
 * auto-populating orgApexClassesMap so that custom classes and methods
 * are identified smartly and accurately even before Tooling API loads or offline.
 */
function scanLogForApexClasses(rawLog) {
    if (!rawLog || typeof rawLog !== 'string') return;

    let hasAdded = false;

    // Pattern 1: METHOD_ENTRY / METHOD_EXIT with 01p ID
    // e.g. METHOD_ENTRY|[292]|01pUo0000004kVh|PlanElectionCompUtility.fetchAllFieldQuery(String)
    const p1 = /\|(?:METHOD_ENTRY|METHOD_EXIT)\|\[[^\]]*\]\|(01p[A-Za-z0-9]{12,15})\|([A-Za-z0-9_]+)\./g;
    let m;
    while ((m = p1.exec(rawLog)) !== null) {
        const id = m[1];
        const name = m[2];
        const key = name.toLowerCase();
        if (!isBuiltinApexType(key)) {
            if (!orgApexClassesMap.has(key)) {
                orgApexClassesMap.set(key, { id: id, name: name, namespace: '', isTrigger: false });
                hasAdded = true;
            } else {
                const ex = orgApexClassesMap.get(key);
                if (!ex.id && id) ex.id = id;
            }
        }
    }

    // Pattern 2: CONSTRUCTOR_ENTRY with 01p ID
    // e.g. CONSTRUCTOR_ENTRY|[218]|01p0L000002zIR1|<init>(Id)|CoverageDisplayManager
    const p2 = /\|(?:CONSTRUCTOR_ENTRY|VF_APEX_CALL_START)\|\[[^\]]*\]\|(01p[A-Za-z0-9]{12,15})\|[^\|]+\|([A-Za-z0-9_]+)/g;
    while ((m = p2.exec(rawLog)) !== null) {
        const id = m[1];
        const name = m[2];
        const key = name.toLowerCase();
        if (!isBuiltinApexType(key)) {
            if (!orgApexClassesMap.has(key)) {
                orgApexClassesMap.set(key, { id: id, name: name, namespace: '', isTrigger: false });
                hasAdded = true;
            } else {
                const ex = orgApexClassesMap.get(key);
                if (!ex.id && id) ex.id = id;
            }
        }
    }

    if (hasAdded) {
        invalidateOrgClassesCache();
    }
}

/* ========================================================
   APEX HEAP MEMORY ADDRESS RESOLVER
   Maps Salesforce heap memory addresses (0x[0-9a-fA-F]+)
   to their actual parsed structures, wrapper classes, lists,
   sets, maps, or sObjects across the current log and session.
   ======================================================== */

const sessionHeapAddressMap = new Map();
const sessionHeapFieldMap = new Map();
let currentLogHeapAddressMap = new Map();
let currentLogHeapFieldMap = new Map();
const indexedLogHashes = new Set();

function hashLogString(str) {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 5000); i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash + '_' + str.length;
}

function splitTopLevel(str, delimiter) {
    const parts = [];
    let depthBrace = 0, depthBracket = 0, depthParen = 0;
    let inQuote = false;
    let quoteChar = '';
    let cur = '';

    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (inQuote) {
            cur += ch;
            if (ch === quoteChar && str[i - 1] !== '\\') inQuote = false;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inQuote = true;
            quoteChar = ch;
            cur += ch;
            continue;
        }
        if (ch === '{') depthBrace++;
        else if (ch === '}') depthBrace--;
        else if (ch === '[') depthBracket++;
        else if (ch === ']') depthBracket--;
        else if (ch === '(') depthParen++;
        else if (ch === ')') depthParen--;

        if (ch === delimiter && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
            parts.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur) parts.push(cur);
    return parts;
}

function parseApexKeyValuePairs(str, delimiter) {
    const fields = {};
    const pairs = splitTopLevel(str, delimiter);
    for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx !== -1) {
            const key = pair.slice(0, eqIdx).trim().replace(/^['"]|['"]$/g, '');
            const val = pair.slice(eqIdx + 1).trim();
            fields[key] = tokenizeApexOrJson(val, key);
        }
    }
    return fields;
}

function parseApexMapEntries(str) {
    const entries = [];
    const pairs = splitTopLevel(str, ',');
    for (const pair of pairs) {
        let sepIdx = pair.indexOf('=');
        if (sepIdx === -1) sepIdx = pair.indexOf(':');
        if (sepIdx !== -1) {
            const key = pair.slice(0, sepIdx).trim().replace(/^['"]|['"]$/g, '');
            const val = pair.slice(sepIdx + 1).trim();
            entries.push({ key: key, value: tokenizeApexOrJson(val, key) });
        }
    }
    return entries;
}

function tokenizeApexOrJson(str, fallbackKey) {
    if (str === null || str === undefined) return { __kind: 'primitive', type: 'null', value: null };
    if (typeof str !== 'string') return jsValueToApexNode(str, fallbackKey);

    str = str.trim();
    if (!str) return { __kind: 'primitive', type: 'string', value: '' };

    // SObject pattern: TypeName:{Field1=Val1, ...}
    const sobjMatch = str.match(/^([A-Za-z0-9_]+):\{(.*)\}$/s);
    if (sobjMatch) {
        const type = sobjMatch[1];
        const inner = sobjMatch[2];
        const fields = parseApexKeyValuePairs(inner, ',');
        return { __kind: 'sobject', __type: type, fields: fields };
    }

    // Wrapper / Class pattern: TypeName:[Prop1=Val1, ...]
    const classMatch = str.match(/^([A-Za-z0-9_]+):\[(.*)\]$/s);
    if (classMatch) {
        const type = classMatch[1];
        const inner = classMatch[2];
        const fields = parseApexKeyValuePairs(inner, ',');
        return { __kind: 'class', __type: type, fields: fields };
    }

    // JSON or Apex Map: {...}
    if (str.startsWith('{') && str.endsWith('}')) {
        try {
            const parsed = JSON.parse(str);
            return jsValueToApexNode(parsed, fallbackKey);
        } catch (e) { }

        const inner = str.slice(1, -1).trim();
        if (!inner) return { __kind: 'map', entries: [] };
        const entries = parseApexMapEntries(inner);
        return { __kind: 'map', entries: entries };
    }

    // JSON or Apex List / Set: [...] or (...)
    if ((str.startsWith('[') && str.endsWith(']')) || (str.startsWith('(') && str.endsWith(')'))) {
        try {
            const parsed = JSON.parse(str);
            return jsValueToApexNode(parsed, fallbackKey);
        } catch (e) { }

        const isSet = str.startsWith('(') || (fallbackKey && /set|tabs/i.test(fallbackKey));
        const inner = str.slice(1, -1).trim();
        if (!inner) return { __kind: 'list', __type: isSet ? 'Set' : 'List', items: [] };
        const items = splitTopLevel(inner, ',').map(s => s.trim()).filter(Boolean).map(s => tokenizeApexOrJson(s));
        return { __kind: 'list', __type: isSet ? 'Set' : 'List', items: items };
    }

    // Truncated Salesforce Collections: "List of size 7 too large to display"
    const sizeM = str.match(/^"?([A-Za-z]+)\s+of\s+size\s+(\d+)\s+too\s+large/i);
    if (sizeM) {
        const kind = sizeM[1].toLowerCase();
        const count = parseInt(sizeM[2], 10);
        return {
            __kind: kind === 'map' ? 'map' : 'list',
            __type: kind === 'set' ? 'Set' : (kind === 'map' ? 'Map' : 'List'),
            sizeHint: count,
            items: [{ __kind: 'primitive', type: 'string', value: `... (${count} items truncated by Salesforce log limits)` }],
            entries: [{ key: '...', value: { __kind: 'primitive', type: 'string', value: `(${count} entries truncated by Salesforce log limits)` } }]
        };
    }

    // Primitive values
    if (str === 'null') return { __kind: 'primitive', type: 'null', value: null };
    if (str === 'true' || str === 'false') return { __kind: 'primitive', type: 'boolean', value: str === 'true' };
    if (!isNaN(Number(str)) && str !== '') return { __kind: 'primitive', type: 'number', value: Number(str) };
    if (/^0x[0-9a-fA-F]{6,10}$/i.test(str)) return { __kind: 'primitive', type: 'string', value: str, _heapRef: str };
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        return { __kind: 'primitive', type: 'string', value: str.slice(1, -1) };
    }
    return { __kind: 'primitive', type: 'string', value: str };
}

function jsValueToApexNode(val, fallbackType, heapRef) {
    if (val === null || val === undefined) {
        return { __kind: 'primitive', type: 'null', value: null, _heapRef: heapRef };
    }
    if (typeof val === 'boolean') {
        return { __kind: 'primitive', type: 'boolean', value: val, _heapRef: heapRef };
    }
    if (typeof val === 'number') {
        return { __kind: 'primitive', type: 'number', value: val, _heapRef: heapRef };
    }
    if (typeof val === 'string') {
        if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
            try {
                const parsed = JSON.parse(val);
                return jsValueToApexNode(parsed, fallbackType, heapRef);
            } catch (e) { }
        }
        if (/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(val) && /^(001|003|005|006|00Q|012|a0I|01p|066|a00|a0J|a03)/.test(val)) {
            return { __kind: 'primitive', type: 'id', value: val, _heapRef: heapRef };
        }
        return { __kind: 'primitive', type: 'string', value: val, _heapRef: heapRef };
    }
    if (Array.isArray(val)) {
        const isSet = (fallbackType === 'Set' || (fallbackType && (fallbackType.endsWith('Set') || fallbackType.endsWith('Tabs'))));
        return {
            __kind: 'list',
            __type: isSet ? 'Set' : 'List',
            items: val.map(it => jsValueToApexNode(it)),
            _heapRef: heapRef
        };
    }
    if (typeof val === 'object') {
        if (val.__kind) {
            if (heapRef && !val._heapRef) val._heapRef = heapRef;
            return val;
        }

        const type = val._type || val.attributes?.type || fallbackType || 'Object';
        const isSObject = /^[A-Z][a-zA-Z0-9_]*(__c|__r)?$/.test(type) && (
            val.Id !== undefined || val.attributes !== undefined ||
            /^(Contact|Account|Case|User|Lead|Opportunity|Coverage__c|Plan_Election__c|Attachment|Rates__c)/i.test(type)
        );

        const fields = {};
        for (const [k, v] of Object.entries(val)) {
            if (k === '_type' || k === 'attributes') continue;
            fields[k] = jsValueToApexNode(v, k);
        }

        if (isSObject) {
            return {
                __kind: 'sobject',
                __type: type,
                fields: fields,
                _heapRef: heapRef
            };
        } else if (fallbackType && (fallbackType.endsWith('Map') || fallbackType.endsWith('Key'))) {
            const entries = [];
            for (const [k, v] of Object.entries(val)) {
                entries.push({ key: k, value: jsValueToApexNode(v) });
            }
            return {
                __kind: 'map',
                entries: entries,
                _heapRef: heapRef
            };
        } else {
            return {
                __kind: 'class',
                __type: type,
                fields: fields,
                _heapRef: heapRef
            };
        }
    }
    return { __kind: 'primitive', type: 'string', value: String(val), _heapRef: heapRef };
}

function hasRealData(node) {
    if (!node) return false;
    if (node.__kind === 'list' || node.__kind === 'array') return (node.items || []).length > 0 || (node.sizeHint || 0) > 0;
    if (node.__kind === 'map') return (node.entries || []).length > 0 || (node.sizeHint || 0) > 0;
    if (node.__kind === 'sobject' || node.__kind === 'class') return Object.keys(node.fields || {}).length > 0;
    if (node.__kind === 'primitive') return node.value !== null && node.value !== '' && !/^0x[0-9a-fA-F]{6,10}$/i.test(String(node.value));
    return true;
}

function mergeApexNodes(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    if (incoming.__kind === 'primitive' && (incoming.value === null || incoming.value === '')) return existing;
    if (existing.__kind === 'primitive' && (existing.value === null || existing.value === '')) return incoming;

    const incomingIsEmpty = (incoming.__kind === 'list' && (!incoming.items || incoming.items.length === 0)) ||
                            (incoming.__kind === 'map' && (!incoming.entries || incoming.entries.length === 0)) ||
                            ((incoming.__kind === 'class' || incoming.__kind === 'sobject') && Object.keys(incoming.fields || {}).length === 0);
    const existingHasData = (existing.__kind === 'list' && existing.items && existing.items.length > 0) ||
                            (existing.__kind === 'map' && existing.entries && existing.entries.length > 0) ||
                            ((existing.__kind === 'class' || existing.__kind === 'sobject') && Object.keys(existing.fields || {}).length > 0);

    if (incomingIsEmpty && existingHasData) {
        return existing;
    }

    if (existing.__kind === 'list' && incoming.__kind === 'list') {
        const exCount = (existing.items || []).length;
        const inCount = (incoming.items || []).length;
        if (inCount >= exCount && inCount > 0) return incoming;
        if (exCount > 0) return existing;
        return incoming;
    }

    if (existing.__kind === 'map' && incoming.__kind === 'map') {
        const mergedEntries = [...(existing.entries || [])];
        const existingKeys = new Set(mergedEntries.map(e => e.key));
        for (const ent of (incoming.entries || [])) {
            if (!existingKeys.has(ent.key)) {
                mergedEntries.push(ent);
                existingKeys.add(ent.key);
            }
        }
        return {
            __kind: 'map',
            entries: mergedEntries,
            _heapRef: incoming._heapRef || existing._heapRef
        };
    }

    if ((existing.__kind === 'sobject' || existing.__kind === 'class') &&
        (incoming.__kind === 'sobject' || incoming.__kind === 'class')) {
        const mergedFields = { ...(existing.fields || {}) };
        for (const [k, v] of Object.entries(incoming.fields || {})) {
            if (!mergedFields[k] || (mergedFields[k].__kind === 'primitive' && (mergedFields[k].value === null || mergedFields[k].value === ''))) {
                mergedFields[k] = v;
            } else if (v && v.__kind && v.__kind !== 'primitive') {
                mergedFields[k] = mergeApexNodes(mergedFields[k], v);
            }
        }
        return {
            __kind: incoming.__kind || existing.__kind,
            __type: (incoming.__type && incoming.__type !== 'Object') ? incoming.__type : existing.__type,
            fields: mergedFields,
            _heapRef: incoming._heapRef || existing._heapRef
        };
    }

    return incoming;
}

function recordAssignment(varName, node, heapAddr, isCurrentLog) {
    if (!node) return;
    if (heapAddr) {
        node._heapRef = heapAddr;
        const addrLower = heapAddr.toLowerCase();
        sessionHeapAddressMap.set(addrLower, mergeApexNodes(sessionHeapAddressMap.get(addrLower), node));
        if (isCurrentLog) {
            currentLogHeapAddressMap.set(addrLower, mergeApexNodes(currentLogHeapAddressMap.get(addrLower), node));
        }
    }

    let clean = varName.replace(/^this\./, '').trim();
    const lower = clean.toLowerCase();
    if (lower && lower !== 'this' && lower !== 'value') {
        sessionHeapFieldMap.set(lower, mergeApexNodes(sessionHeapFieldMap.get(lower), node));
        if (isCurrentLog) {
            currentLogHeapFieldMap.set(lower, mergeApexNodes(currentLogHeapFieldMap.get(lower), node));
        }
    }
}

function enrichPlanMaps(fieldMap, currentFieldMap) {
    if (!fieldMap) return;
    let planElecMap = fieldMap.get('planelectionmap');
    if (!planElecMap || (planElecMap.__kind === 'class' && Object.keys(planElecMap.fields || {}).length === 0)) {
        planElecMap = { __kind: 'map', entries: [] };
    }
    let planTypeMap = fieldMap.get('plantypemap');
    if (!planTypeMap || (planTypeMap.__kind === 'class' && Object.keys(planTypeMap.fields || {}).length === 0)) {
        planTypeMap = { __kind: 'map', entries: [] };
    }
    let planWithElecMap = fieldMap.get('planwithelectionmap');
    if (!planWithElecMap || (planWithElecMap.__kind === 'class' && Object.keys(planWithElecMap.fields || {}).length === 0)) {
        planWithElecMap = { __kind: 'map', entries: [] };
    }

    const lists = [
        fieldMap.get('medicalplanlist'),
        fieldMap.get('voluntarylifeplanlist'),
        fieldMap.get('dentalplanlist'),
        fieldMap.get('visionplanlist'),
        fieldMap.get('currentplanslist'),
        fieldMap.get('renewalplanslist')
    ];

    for (const listNode of lists) {
        if (!listNode || !Array.isArray(listNode.items)) continue;
        for (const item of listNode.items) {
            let pe = item.fields ? (item.fields.pe || item.fields.planElection) : null;
            if (pe && pe.__kind === 'primitive' && typeof pe.value === 'string' && /^0x[0-9a-fA-F]+$/i.test(pe.value)) {
                pe = sessionHeapAddressMap.get(pe.value.toLowerCase()) || pe;
            }
            if (!pe || !pe.fields) continue;
            const recType = (pe.fields.Plan_Record_Type_Nm__c && pe.fields.Plan_Record_Type_Nm__c.value) ||
                            (pe.fields.Plan_Type__c && pe.fields.Plan_Type__c.value) ||
                            (pe.fields.Name && pe.fields.Name.value);
            const planName = (pe.fields.Plan_Name__c && pe.fields.Plan_Name__c.value) ||
                             (pe.fields.Name && pe.fields.Name.value) || recType;

            if (recType && planElecMap.entries && !planElecMap.entries.some(e => e.key === recType)) {
                planElecMap.entries.push({ key: recType, value: pe });
            }
            if (planName && planTypeMap.entries && !planTypeMap.entries.some(e => e.key === planName)) {
                planTypeMap.entries.push({ key: planName, value: pe });
            }
            if (planName && planWithElecMap.entries && !planWithElecMap.entries.some(e => e.key === planName)) {
                planWithElecMap.entries.push({ key: planName, value: pe });
            }
        }
    }

    if (planElecMap.entries && planElecMap.entries.length > 0) {
        fieldMap.set('planelectionmap', planElecMap);
        if (currentFieldMap) currentFieldMap.set('planelectionmap', planElecMap);
    }
    if (planTypeMap.entries && planTypeMap.entries.length > 0) {
        fieldMap.set('plantypemap', planTypeMap);
        if (currentFieldMap) currentFieldMap.set('plantypemap', planTypeMap);
    }
    if (planWithElecMap.entries && planWithElecMap.entries.length > 0) {
        fieldMap.set('planwithelectionmap', planWithElecMap);
        if (currentFieldMap) currentFieldMap.set('planwithelectionmap', planWithElecMap);
    }
}

function indexHeapAssignments(rawLog, isCurrentLog) {
    if (!rawLog || typeof rawLog !== 'string') return;
    if (isCurrentLog === undefined) isCurrentLog = true;

    if (isCurrentLog) {
        currentLogHeapAddressMap = new Map();
        currentLogHeapFieldMap = new Map();
    }

    const lines = rawLog.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. VARIABLE_ASSIGNMENT
        if (line.includes('|VARIABLE_ASSIGNMENT|')) {
            const parts = line.split('|VARIABLE_ASSIGNMENT|');
            if (parts.length >= 2) {
                const rest = parts[1];
                const m = rest.match(/^(?:\[(?:[0-9]+|EXTERNAL)\]\|)?([^|]+)\|(.*)$/s);
                if (m) {
                    const varName = m[1].trim();
                    let valPart = m[2];
                    let heapAddr = '';

                    const refMatch = valPart.match(/^(.*?)(\|0x[0-9a-fA-F]+)$/);
                    if (refMatch) {
                        valPart = refMatch[1].trim();
                        heapAddr = refMatch[2].replace('|', '').trim().toLowerCase();
                    }

                    const node = tokenizeApexOrJson(valPart, varName);
                    if (node) {
                        recordAssignment(varName, node, heapAddr, isCurrentLog);

                        let cleanProp = varName.replace(/^this\./, '').trim();
                        if (cleanProp.toLowerCase() === 'this' && (node.__kind === 'class' || node.__kind === 'sobject')) {
                            for (const [k, child] of Object.entries(node.fields || {})) {
                                if (child.__kind === 'primitive' && typeof child.value === 'string' && /^0x[0-9a-fA-F]{6,10}$/i.test(child.value)) {
                                    const target = child.value.toLowerCase();
                                    const known = sessionHeapFieldMap.get(k.toLowerCase());
                                    if (known) {
                                        sessionHeapAddressMap.set(target, mergeApexNodes(sessionHeapAddressMap.get(target), known));
                                        if (isCurrentLog) currentLogHeapAddressMap.set(target, known);
                                    }
                                } else if (child.__kind !== 'primitive' || (child.value !== null && child.value !== '')) {
                                    recordAssignment(k, child, null, isCurrentLog);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. USER_DEBUG
        if (line.includes('|USER_DEBUG|')) {
            const dbgIdx = line.indexOf('|DEBUG|');
            if (dbgIdx !== -1) {
                const dbgText = line.substring(dbgIdx + 7).trim();
                const kvMatch = dbgText.match(/^([A-Za-z0-9_.]+)\s*(?::|::|=|=>)\s*(.*)$/s);
                if (kvMatch) {
                    const varName = kvMatch[1].trim();
                    const valPart = kvMatch[2].trim();
                    if (valPart.startsWith('{') || valPart.startsWith('[') || valPart.startsWith('(') || /^[A-Za-z0-9_]+:[\{\[]/.test(valPart)) {
                        const node = tokenizeApexOrJson(valPart, varName);
                        if (node) {
                            recordAssignment(varName, node, null, isCurrentLog);
                        }
                    }
                }
            }
        }
    }
}

function resolveHeapReference(heapAddr, keyName, visited) {
    if (!heapAddr || typeof heapAddr !== 'string') return null;
    const addr = heapAddr.trim();
    const addrLower = addr.toLowerCase();

    if (!visited) visited = new Set();
    if (visited.has(addrLower)) {
        return { __kind: 'primitive', type: 'string', value: `[Circular ${addrLower}]`, _heapRef: addr };
    }
    const nextVisited = new Set(visited);
    nextVisited.add(addrLower);

    let resolved = currentLogHeapAddressMap.get(addrLower) || sessionHeapAddressMap.get(addrLower);
    if (resolved && hasRealData(resolved)) {
        return deepCloneAndResolve(resolved, nextVisited, addr);
    }

    const cleanKey = (keyName || '').replace(/^this\./, '');
    const keyLower = cleanKey.toLowerCase();
    if (keyLower) {
        let fieldResolved = currentLogHeapFieldMap.get(keyLower);
        if (!fieldResolved || !hasRealData(fieldResolved)) {
            fieldResolved = sessionHeapFieldMap.get(keyLower);
        }
        if (fieldResolved && hasRealData(fieldResolved)) {
            return deepCloneAndResolve(fieldResolved, nextVisited, addr);
        }

        if (resolved) {
            return deepCloneAndResolve(resolved, nextVisited, addr);
        }

        if (keyLower.endsWith('set') || keyLower.endsWith('idset') || keyLower.endsWith('tabs')) {
            return { __kind: 'list', __type: 'Set', items: [], _heapRef: addr };
        }
        if (keyLower.endsWith('list') || keyLower.endsWith('lst') || keyLower.endsWith('records') || keyLower.endsWith('chids') || keyLower.endsWith('spouses')) {
            return { __kind: 'list', __type: 'List', items: [], _heapRef: addr };
        }
        if (keyLower.endsWith('map') || keyLower.endsWith('key')) {
            return { __kind: 'map', entries: [], _heapRef: addr };
        }
        if (keyLower.endsWith('modal') || keyLower.endsWith('wrapper')) {
            return { __kind: 'class', __type: cleanKey, fields: {}, _heapRef: addr };
        }
        if (['employee', 'con', 'contact'].includes(keyLower)) {
            return { __kind: 'sobject', __type: 'Contact', fields: {}, _heapRef: addr };
        }
        if (['usr', 'user'].includes(keyLower)) {
            return { __kind: 'sobject', __type: 'User', fields: {}, _heapRef: addr };
        }
        if (['caseinfo', 'case'].includes(keyLower)) {
            return { __kind: 'sobject', __type: 'Case', fields: {}, _heapRef: addr };
        }
        if (['branch', 'acc', 'account'].includes(keyLower)) {
            return { __kind: 'sobject', __type: 'Account', fields: {}, _heapRef: addr };
        }
        if (keyLower.startsWith('attachment')) {
            return { __kind: 'sobject', __type: 'Attachment', fields: {}, _heapRef: addr };
        }
    }

    if (resolved) {
        return deepCloneAndResolve(resolved, nextVisited, addr);
    }

    return { __kind: 'class', __type: cleanKey || 'Object', fields: {}, _heapRef: addr };
}

function deepCloneAndResolve(node, visited, heapRef) {
    if (!node) return null;
    const cloned = JSON.parse(JSON.stringify(node));
    cloned._heapRef = heapRef || node._heapRef;
    return resolveApexNodeTree('', cloned, visited);
}

function resolveApexNodeTree(keyName, node, visited) {
    if (!node) return node;
    if (!visited) visited = new Set();

    if (node.__kind === 'primitive' && typeof node.value === 'string' && /^0x[0-9a-fA-F]{6,10}$/i.test(node.value.trim())) {
        const resolved = resolveHeapReference(node.value.trim(), keyName, visited);
        if (resolved) return resolved;
    }

    if (node.__kind === 'sobject' || node.__kind === 'class') {
        const newFields = {};
        for (const [k, v] of Object.entries(node.fields || {})) {
            const nextVisited = new Set(visited);
            newFields[k] = resolveApexNodeTree(k, v, nextVisited);
        }
        node.fields = newFields;
    } else if (node.__kind === 'map') {
        const newEntries = (node.entries || []).map(e => ({
            key: e.key,
            value: resolveApexNodeTree(e.key, e.value, new Set(visited))
        }));
        node.entries = newEntries;
    } else if (node.__kind === 'list' || node.__kind === 'array') {
        const newItems = (node.items || []).map(item => resolveApexNodeTree(keyName, item, new Set(visited)));
        node.items = newItems;
    }

    return node;
}

let currentTraceFlag = null;
let currentDebugLevel = null;
let traceFlagSeq = 0; // increments on every trace flag request; stale responses are ignored

const USER_ID_REGEX = /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/;

const CATEGORY_CONFIG_DEFS = [
    { name: 'Database', field: 'Database', defaultLevel: 'Finest' },
    { name: 'Workflow', field: 'Workflow', defaultLevel: 'Finer' },
    { name: 'Validation', field: 'Validation', defaultLevel: 'Info' },
    { name: 'Callouts', field: 'Callout', defaultLevel: 'Finest' },
    { name: 'Apex Code', field: 'ApexCode', defaultLevel: 'Finest' },
    { name: 'Apex Profiling', field: 'ApexProfiling', defaultLevel: 'Finest' },
    { name: 'Visualforce', field: 'Visualforce', defaultLevel: 'Finer' },
    { name: 'System', field: 'System', defaultLevel: 'Fine' },
    { name: 'Wave', field: 'Wave', defaultLevel: 'Finest' },
    { name: 'Nba', field: 'Nba', defaultLevel: 'Finer' },
    { name: 'Access', field: 'Access', defaultLevel: 'Finer' }
];

const MASTER_EVENTS_BY_CATEGORY_LEVEL = {
    'Database': {
        'NONE': [],
        'INFO': [
            'SOQL_EXECUTE_BEGIN', 'SOQL_EXECUTE_END', 'SOSL_EXECUTE_BEGIN',
            'SOSL_EXECUTE_END', 'DML_BEGIN', 'DML_END'
        ],
        'FINEST': [
            'SOQL_EXECUTE_BEGIN', 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_EXPLAIN',
            'SOSL_EXECUTE_BEGIN', 'SOSL_EXECUTE_END', 'QUERY_MORE_ITERATIONS',
            'QUERY_MORE_BEGIN', 'QUERY_MORE_END', 'DML_BEGIN', 'DML_END',
            'FOR_UPDATE_LOCKS', 'RELEASE', 'FOR_UPDATE_LOCKS_RELEASE', 'IDEAS_QUERY_EXECUTE',
            'USER_MODE_PERMSET_APPLIED', 'CURSOR_CREATE_BEGIN', 'CURSOR_CREATE_END',
            'CURSOR_FETCH', 'CURSOR_FETCH_PAGE', 'BULK_DML_RETRY', 'SAVEPOINT_SET',
            'SAVEPOINT_ROLLBACK', 'SAVEPOINT_RESET', 'SAVEPOINT_RELEASE'
        ]
    },
    'Workflow': {
        'NONE': [],
        'ERROR': [
            'WF_FLOW_ACTION_ERROR', 'WF_FLOW_ACTION_ERROR_DETAIL',
            'FLOW_CREATE_INTERVIEW_ERROR', 'FLOW_START_INTERVIEWS_ERROR',
            'FLOW_ELEMENT_ERROR', 'INVOCABLE_ACTION_ERROR', 'FLOW_ELEMENT_FAULT'
        ],
        'WARN': [
            'WF_FLOW_ACTION_ERROR', 'WF_FLOW_ACTION_ERROR_DETAIL',
            'FLOW_CREATE_INTERVIEW_ERROR', 'FLOW_START_INTERVIEWS_ERROR',
            'FLOW_ELEMENT_ERROR', 'INVOCABLE_ACTION_ERROR', 'FLOW_ELEMENT_FAULT'
        ],
        'INFO': [
            'WF_RULE_INVOCATION', 'WF_APPROVAL', 'WF_FIELD_UPDATE', 'WF_ACTION',
            'FLOW_CREATE_INTERVIEW_BEGIN', 'FLOW_CREATE_INTERVIEW_END',
            'FLOW_START_INTERVIEWS_BEGIN', 'FLOW_START_INTERVIEWS_END', 'FLOW_INTERVIEW_FINISHED'
        ],
        'FINE': null,
        'FINER': [
            'WF_RULE_INVOCATION', 'WF_APPROVAL', 'WF_FIELD_UPDATE', 'WF_SPOOL_ACTION_BEGIN',
            'WF_ACTION', 'WF_FORMULA', 'WF_RULE_EVAL_BEGIN', 'WF_RULE_EVAL_END',
            'WF_RULE_EVAL_VALUE', 'WF_CRITERIA_BEGIN', 'WF_CRITERIA_END', 'WF_RULE_ENTRY_ORDER',
            'WF_RULE_NOT_EVALUATED', 'WF_RULE_FILTER', 'WF_ESCALATION_RULE', 'WF_ESCALATION_ACTION',
            'WF_TIME_TRIGGERS_BEGIN', 'WF_TIME_TRIGGER', 'WF_ACTIONS_END', 'WF_ENQUEUE_ACTIONS',
            'WF_APPROVAL_SUBMIT', 'WF_APPROVAL_SUBMITTER', 'WF_APPROVAL_REMOVE', 'WF_NEXT_APPROVER',
            'WF_EVAL_ENTRY_CRITERIA', 'WF_PROCESS_FOUND', 'WF_SOFT_REJECT', 'WF_HARD_REJECT',
            'WF_PROCESS_NODE', 'WF_ASSIGN', 'WF_REASSIGN_RECORD', 'WF_RESPONSE_NOTIFY',
            'WF_OUTBOUND_MSG', 'WF_ACTION_TASK', 'WF_EMAIL_ALERT', 'WF_EMAIL_SENT',
            'SLA_PROCESS_CASE', 'SLA_NULL_START_DATE', 'SLA_EVAL_MILESTONE', 'SLA_END',
            'WF_KNOWLEDGE_ACTION', 'WF_SEND_ACTION', 'WF_CHATTER_POST', 'WF_QUICK_CREATE',
            'WF_FLOW_ACTION_BEGIN', 'WF_FLOW_ACTION_DETAIL', 'WF_FLOW_ACTION_END',
            'WF_FLOW_ACTION_ERROR', 'WF_FLOW_ACTION_ERROR_DETAIL', 'WF_APEX_ACTION',
            'EVENT_SERVICE_PUB_BEGIN', 'EVENT_SERVICE_PUB_DETAIL', 'EVENT_SERVICE_PUB_END',
            'EVENT_SERVICE_SUB_BEGIN', 'EVENT_SERVICE_SUB_DETAIL', 'EVENT_SERVICE_SUB_END',
            'SCHEDULED_FLOW_DETAIL', 'FLOW_CREATE_INTERVIEW_BEGIN', 'FLOW_CREATE_INTERVIEW_END',
            'FLOW_CREATE_INTERVIEW_ERROR', 'FLOW_START_INTERVIEWS_BEGIN', 'FLOW_START_INTERVIEWS_END',
            'FLOW_START_INTERVIEWS_ERROR', 'FLOW_START_INTERVIEW_BEGIN', 'FLOW_START_INTERVIEW_END',
            'FLOW_START_INTERVIEW_LIMIT_USAGE', 'FLOW_INTERVIEW_PAUSED', 'FLOW_INTERVIEW_RESUMED',
            'FLOW_INTERVIEW_FINISHED', 'FLOW_INTERVIEW_FINISHED_LIMIT_USAGE', 'FLOW_ELEMENT_LIMIT_USAGE',
            'FLOW_BULK_ELEMENT_LIMIT_USAGE', 'FLOW_ELEMENT_BEGIN', 'FLOW_ELEMENT_END',
            'FLOW_ELEMENT_FAULT', 'FLOW_ELEMENT_DEFERRED', 'FLOW_ELEMENT_ERROR', 'FLOW_BULK_ELEMENT_BEGIN',
            'FLOW_BULK_ELEMENT_END', 'FLOW_BULK_ELEMENT_DETAIL', 'FLOW_BULK_ELEMENT_NOT_SUPPORTED',
            'FLOW_ASSIGNMENT_DETAIL', 'FLOW_SUBFLOW_DETAIL', 'FLOW_RULE_DETAIL',
            'FLOW_VALUE_ASSIGNMENT', 'FLOW_LOOP_DETAIL', 'FLOW_ACTIONCALL_DETAIL',
            'FLOW_WAIT_WAITING_DETAIL', 'FLOW_WAIT_RESUMING_DETAIL', 'FLOW_WAIT_EVENT_WAITING_DETAIL',
            'FLOW_WAIT_EVENT_RESUMING_DETAIL', 'INVOCABLE_ACTION_DETAIL', 'INVOCABLE_ACTION_ERROR',
            'FLOW_COLLECTION_PROCESSOR_DETAIL', 'FLOW_SCHEDULED_PATH_QUEUED', 'ROUTE_WORK_ACTION',
            'WORK_ACTION', 'PROMPT_END', 'CALL_ADD_SKILL_REQUIREMENT_ACTION', 'ADD_SCREEN_POP_ACTION',
            'OUTBOUND_VOICE_CALL', 'external_transfer_call', 'CAPTURE_VOICE_MESSAGE',
            'IN_QUEUE_FLOW', 'DETECT_VOICE_INTENT', 'POST_CALL_EXPERIENCE', 'GET_QUEUE_STATUS',
            'VOICE_FLOW'
        ],
        'FINEST': null
    },
    'Validation': {
        'NONE': [],
        'INFO': [
            'VALIDATION_RULE', 'VALIDATION_FAIL', 'VALIDATION_PASS',
            'VALIDATION_ERROR', 'VALIDATION_FORMULA'
        ],
        'FINEST': [
            'VALIDATION_RULE', 'VALIDATION_FAIL', 'VALIDATION_PASS',
            'VALIDATION_ERROR', 'VALIDATION_FORMULA'
        ]
    },
    'Callouts': {
        'NONE': [],
        'INFO': ['CALLOUT_REQUEST', 'CALLOUT_RESPONSE'],
        'FINEST': [
            'CALLOUT_REQUEST_PREPARE', 'CALLOUT_REQUEST_FINALIZE', 'CALLOUT_REQUEST',
            'CALLOUT_RESPONSE', 'FUNCTION_INVOCATION_REQUEST', 'FUNCTION_INVOCATION_RESPONSE',
            'XDS_RESPONSE', 'XDS_RESPONSE_DETAIL', 'XDS_RESPONSE_ERROR',
            'XDS_REQUEST_DETAIL', 'NAMED_CREDENTIAL_REQUEST', 'NAMED_CREDENTIAL_RESPONSE',
            'NAMED_CREDENTIAL_RESPONSE_DETAIL', 'EXTERNAL_SERVICE_REQUEST',
            'EXTERNAL_SERVICE_RESPONSE', 'EXTERNAL_SERVICE_CALLBACK'
        ]
    },
    'Apex Code': {
        'NONE': [],
        'ERROR': ['EXCEPTION_THROWN', 'FATAL_ERROR'],
        'WARN': ['EXCEPTION_THROWN', 'FATAL_ERROR', 'USER_DEBUG_WARN'],
        'INFO': [
            'USER_DEBUG', 'USER_DEBUG_INFO', 'EMAIL_QUEUE',
            'EXECUTION_STARTED', 'EXECUTION_FINISHED', 'CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED'
        ],
        'DEBUG': [
            'USER_DEBUG', 'USER_DEBUG_INFO', 'USER_DEBUG_WARN', 'USER_DEBUG_ERROR',
            'DATAWEAVE_USER_DEBUG', 'METHOD_ENTRY', 'METHOD_EXIT', 'CONSTRUCTOR_ENTRY',
            'CONSTRUCTOR_EXIT', 'EXECUTION_STARTED', 'EXECUTION_FINISHED',
            'CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED'
        ],
        'FINE': [
            'USER_DEBUG', 'USER_DEBUG_INFO', 'USER_DEBUG_WARN', 'USER_DEBUG_ERROR',
            'DATAWEAVE_USER_DEBUG', 'USER_DEBUG_FINE', 'METHOD_ENTRY', 'METHOD_EXIT',
            'CONSTRUCTOR_ENTRY', 'CONSTRUCTOR_EXIT', 'WF_APEX_CALL', 'VF_PAGE_MESSAGE',
            'ENTERING_MANAGED_PKG', 'APP_ANALYTICS_FINE', 'EXECUTION_STARTED',
            'EXECUTION_FINISHED', 'CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED'
        ],
        'FINER': null,
        'FINEST': [
            'VARIABLE_SCOPE_BEGIN', 'VARIABLE_SCOPE_END', 'VARIABLE_ASSIGNMENT',
            'STATEMENT_EXECUTE', 'BULK_COUNTABLE_STATEMENT_EXECUTE', 'EXCEPTION_THROWN',
            'METHOD_ENTRY', 'METHOD_EXIT', 'CONSTRUCTOR_ENTRY', 'CONSTRUCTOR_EXIT',
            'HEAP_ALLOCATE', 'BULK_HEAP_ALLOCATE', 'HEAP_DEALLOCATE', 'FORMULA_BUILD',
            'FORMULA_EVALUATE_BEGIN', 'FORMULA_EVALUATE_END', 'DATAWEAVE_USER_DEBUG',
            'USER_DEBUG_FINEST', 'USER_DEBUG_FINER', 'USER_DEBUG_FINE', 'USER_DEBUG',
            'USER_DEBUG_INFO', 'USER_DEBUG_WARN', 'USER_DEBUG_ERROR', 'EMAIL_QUEUE',
            'FATAL_ERROR', 'WF_APEX_CALL', 'VF_PAGE_MESSAGE', 'ENTERING_MANAGED_PKG',
            'HEAP_DUMP', 'SCRIPT_EXECUTION', 'PUSH_NOTIFICATION_NO_DEVICES',
            'PUSH_NOTIFICATION_SENT', 'PUSH_NOTIFICATION_NOT_ENABLED',
            'PUSH_NOTIFICATION_INVALID_CERTIFICATE', 'PUSH_NOTIFICATION_INVALID_APP',
            'PUSH_NOTIFICATION_INVALID_NOTIFICATION', 'SESSION_CACHE_PUT_BEGIN',
            'SESSION_CACHE_GET_BEGIN', 'SESSION_CACHE_PUT_END', 'SESSION_CACHE_GET_END',
            'SESSION_CACHE_MEMORY_USAGE', 'SESSION_CACHE_REMOVE_BEGIN', 'SESSION_CACHE_REMOVE_END',
            'ORG_CACHE_PUT_BEGIN', 'ORG_CACHE_GET_BEGIN', 'ORG_CACHE_PUT_END',
            'ORG_CACHE_GET_END', 'ORG_CACHE_MEMORY_USAGE', 'ORG_CACHE_REMOVE_BEGIN',
            'ORG_CACHE_REMOVE_END', 'AE_PERSIST_VALIDATION', 'APP_ANALYTICS_FINE',
            'APP_ANALYTICS_WARN', 'APP_ANALYTICS_ERROR', 'QUERY_SQL_LOG',
            'EXECUTION_STARTED', 'EXECUTION_FINISHED', 'CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED'
        ]
    },
    'Apex Profiling': {
        'NONE': [],
        'MINIMAL': ['CUMULATIVE_LIMIT_USAGE', 'LIMIT_USAGE', 'TOTAL_EMAIL_RECIPIENTS_QUEUED'],
        'DEBUG': ['CUMULATIVE_LIMIT_USAGE', 'LIMIT_USAGE', 'TOTAL_EMAIL_RECIPIENTS_QUEUED'],
        'FINE': [
            'CUMULATIVE_LIMIT_USAGE', 'LIMIT_USAGE', 'LIMIT_USAGE_FOR_NS',
            'TESTING_LIMITS', 'TOTAL_EMAIL_RECIPIENTS_QUEUED'
        ],
        'FINEST': [
            'CUMULATIVE_PROFILING_BEGIN', 'CUMULATIVE_PROFILING', 'CUMULATIVE_PROFILING_END',
            'CUMULATIVE_LIMIT_USAGE', 'CUMULATIVE_LIMIT_USAGE_END', 'TESTING_LIMITS',
            'LIMIT_USAGE', 'LIMIT_USAGE_FOR_NS', 'TOTAL_EMAIL_RECIPIENTS_QUEUED',
            'STATIC_VARIABLE_LIST', 'STACK_FRAME_VARIABLE_LIST', 'REFERENCED_OBJECT_LIST'
        ]
    },
    'Visualforce': {
        'NONE': [],
        'MINIMAL': ['VF_APEX_CALL_START', 'VF_APEX_CALL_END'],
        'DEBUG': ['VF_APEX_CALL_START', 'VF_APEX_CALL_END'],
        'FINE': null,
        'FINER': [
            'VF_APEX_CALL_START', 'VF_APEX_CALL_END', 'VF_SERIALIZE_VIEWSTATE_BEGIN',
            'VF_SERIALIZE_VIEWSTATE_END', 'VF_DESERIALIZE_VIEWSTATE_BEGIN',
            'VF_DESERIALIZE_VIEWSTATE_END', 'VF_SERIALIZE_CONTINUATION_STATE_BEGIN',
            'VF_SERIALIZE_CONTINUATION_STATE_END', 'VF_DESERIALIZE_CONTINUATION_STATE_BEGIN',
            'VF_DESERIALIZE_CONTINUATION_STATE_END', 'VF_EVALUATE_FORMULA_BEGIN',
            'VF_EVALUATE_FORMULA_END'
        ],
        'FINEST': null
    },
    'System': {
        'NONE': [],
        'DEBUG': [
            'SYSTEM_METHOD_ENTRY', 'SYSTEM_METHOD_EXIT', 'SYSTEM_CONSTRUCTOR_ENTRY',
            'SYSTEM_CONSTRUCTOR_EXIT', 'SYSTEM_MODE_ENTER', 'SYSTEM_MODE_EXIT'
        ],
        'FINE': [
            'SYSTEM_METHOD_ENTRY', 'SYSTEM_METHOD_EXIT', 'SYSTEM_CONSTRUCTOR_ENTRY',
            'SYSTEM_CONSTRUCTOR_EXIT', 'SYSTEM_MODE_ENTER', 'SYSTEM_MODE_EXIT',
            'DUPLICATE_DETECTION_BEGIN', 'DUPLICATE_DETECTION_RULE_INVOCATION',
            'DUPLICATE_DETECTION_MATCH_INVOCATION_SUMMARY', 'DUPLICATE_DETECTION_MATCH_INVOCATION_DETAILS',
            'DUPLICATE_DETECTION_END', 'DUPLICATE_RULE_FILTER', 'DUPLICATE_RULE_FILTER_RESULT',
            'DUPLICATE_RULE_FILTER_VALUE', 'PUSH_TRACE_FLAGS', 'POP_TRACE_FLAGS',
            'MATCH_ENGINE_BEGIN', 'MATCH_ENGINE_INVOCATION', 'MATCH_ENGINE_END',
            'RLM_PRICING_BEGIN', 'RLM_PRICING_END', 'RLM_CONFIGURATOR_BEGIN',
            'RLM_CONFIGURATOR_STATS', 'RLM_CONFIGURATOR_END', 'RLM_CONFIGURATOR_DEPLOY'
        ],
        'FINER': null,
        'FINEST': null
    },
    'Wave': {
        'NONE': [],
        'INFO': [
            'TEMPLATE_PROCESSING_ERROR', 'TRANSFORMATION_SUMMARY', 'RULES_EXECUTION_SUMMARY',
            'ASSET_DIFF_SUMMARY', 'JSON_DIFF_SUMMARY'
        ],
        'FINE': null,
        'FINER': null,
        'FINEST': [
            'TEMPLATE_PROCESSING_ERROR', 'WAVE_APP_LIFECYCLE', 'APP_CONTAINER_INITIATED',
            'TEMPLATED_ASSET', 'TRANSFORMATION_SUMMARY', 'RULES_EXECUTION_SUMMARY',
            'ASSET_DIFF_SUMMARY', 'JSON_DIFF_SUMMARY', 'RULES_EXECUTION_DETAIL',
            'ASSET_DIFF_DETAIL', 'JSON_DIFF_DETAIL'
        ]
    },
    'Nba': {
        'NONE': [],
        'INFO': [
            'NBA_STRATEGY_BEGIN', 'NBA_STRATEGY_END', 'NBA_STRATEGY_ERROR',
            'NBA_NODE_ERROR', 'NBA_OFFER_INVALID'
        ],
        'FINE': [
            'NBA_STRATEGY_BEGIN', 'NBA_STRATEGY_END', 'NBA_NODE_BEGIN',
            'NBA_NODE_END', 'NBA_STRATEGY_ERROR', 'NBA_NODE_ERROR',
            'NBA_OFFER_INVALID', 'NBA_NODE_DETAIL'
        ],
        'FINER': [
            'NBA_STRATEGY_BEGIN', 'NBA_STRATEGY_END', 'NBA_NODE_BEGIN',
            'NBA_NODE_END', 'NBA_STRATEGY_ERROR', 'NBA_NODE_ERROR',
            'NBA_OFFER_INVALID', 'NBA_NODE_DETAIL'
        ],
        'FINEST': null
    },
    'Access': {
        'NONE': [],
        'FINER': [
            'DATA_ACCESS_EVALUATION', 'POLICY_RULE_EVALUATION_REQUEST',
            'POLICY_RULE_EVALUATION_START', 'POLICY_RULE_EVALUATION_RESPONSE',
            'POLICY_RULE_EVALUATION_SKIPPED', 'POLICY_RULE_DEFINITION_CONDITION_EVALUATION_RESPONSE'
        ],
        'FINEST': null
    }
};

/* ========================================================
   SMALL UTILITIES
   ======================================================== */

const _ESC_HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    if (!/[&<>"']/.test(str)) return str;
    return str.replace(/[&<>"']/g, c => _ESC_HTML_MAP[c]);
}

// Escape a value for use inside a single-quoted SOQL string literal
function escSoql(val) {
    return String(val === null || val === undefined ? '' : val)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

// Escape text for XML (SOAP request bodies)
function escXml(val) {
    return String(val === null || val === undefined ? '' : val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Escape the RAW text first-class: finds matches in the raw text, then escapes each piece.
// This fixes searching for characters like & < > " which never matched against pre-escaped HTML.
function highlightText(raw, searchLower) {
    const s = String(raw === null || raw === undefined ? '' : raw);
    if (!searchLower) return escapeHtml(s);
    const lower = s.toLowerCase();
    let out = '';
    let pos = 0;
    let idx;
    while ((idx = lower.indexOf(searchLower, pos)) !== -1) {
        out += escapeHtml(s.slice(pos, idx));
        out += '<span class="log_highlight">' + escapeHtml(s.slice(idx, idx + searchLower.length)) + '</span>';
        pos = idx + searchLower.length;
    }
    return out + escapeHtml(s.slice(pos));
}

function authHeaders(extra) {
    const h = new Headers();
    h.append('Authorization', 'Bearer ' + sessionId);
    if (extra) Object.keys(extra).forEach(k => h.append(k, extra[k]));
    return h;
}

function toolingQueryUrl(soql, version) {
    return baseUrl + '/services/data/' + (version || 'v59.0') + '/tooling/query?q=' + encodeURIComponent(soql);
}

/* ========================================================
   EVENT / CATEGORY MODEL
   ======================================================== */

function getEventsForCategoryAndLevel(catName, levelUpper) {
    const catMap = MASTER_EVENTS_BY_CATEGORY_LEVEL[catName];
    if (!catMap) return [];
    if (!levelUpper || levelUpper === 'NONE') return [];

    if (catMap[levelUpper] && Array.isArray(catMap[levelUpper])) {
        return [...catMap[levelUpper]];
    }

    const levelsOrder = ['FINEST', 'FINER', 'FINE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'MINIMAL'];
    const idx = levelsOrder.indexOf(levelUpper);
    if (idx !== -1) {
        for (let i = idx; i < levelsOrder.length; i++) {
            const l = levelsOrder[i];
            if (catMap[l] && Array.isArray(catMap[l])) return [...catMap[l]];
        }
        for (let i = idx - 1; i >= 0; i--) {
            const l = levelsOrder[i];
            if (catMap[l] && Array.isArray(catMap[l])) return [...catMap[l]];
        }
    }

    const keys = Object.keys(catMap).filter(k => Array.isArray(catMap[k]) && catMap[k].length > 0);
    if (keys.length > 0) {
        keys.sort((a, b) => catMap[b].length - catMap[a].length);
        return [...catMap[keys[0]]];
    }
    return [];
}

function buildDefaultCategories() {
    return CATEGORY_CONFIG_DEFS.map(def => {
        const events = getEventsForCategoryAndLevel(def.name, def.defaultLevel.toUpperCase());
        return {
            name: def.name,
            level: def.defaultLevel,
            events: events
        };
    });
}

let DEBUG_CATEGORIES = buildDefaultCategories();

let ALL_EVENTS_LIST = [];
DEBUG_CATEGORIES.forEach(cat => {
    cat.events.forEach(ev => ALL_EVENTS_LIST.push(ev.toUpperCase()));
});
let ALL_EVENTS_SET = new Set(ALL_EVENTS_LIST);

function parseDebugLevelHtml(html) {
    if (!html || typeof html !== 'string') return null;
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const knownCategories = [
            'database', 'workflow', 'validation', 'callouts', 'callout',
            'apex code', 'apex profiling', 'visualforce', 'system',
            'wave', 'nba', 'access'
        ];

        const rows = doc.querySelectorAll('tr');
        const categories = [];

        rows.forEach(tr => {
            const cells = tr.querySelectorAll('th, td');
            if (cells.length < 3) return;

            const col0Text = cells[0].textContent.trim();
            const col0Lower = col0Text.toLowerCase();

            const matchedCat = knownCategories.find(kc => kc === col0Lower);
            if (!matchedCat) return;

            let standardName = col0Text;
            if (col0Lower === 'callout' || col0Lower === 'callouts') standardName = 'Callouts';
            else if (col0Lower === 'apex code') standardName = 'Apex Code';
            else if (col0Lower === 'apex profiling') standardName = 'Apex Profiling';
            else if (col0Lower === 'visualforce') standardName = 'Visualforce';
            else if (col0Lower === 'database') standardName = 'Database';
            else if (col0Lower === 'workflow') standardName = 'Workflow';
            else if (col0Lower === 'validation') standardName = 'Validation';
            else if (col0Lower === 'system') standardName = 'System';
            else if (col0Lower === 'wave') standardName = 'Wave';
            else if (col0Lower === 'nba') standardName = 'Nba';
            else if (col0Lower === 'access') standardName = 'Access';

            let level = '';
            const selectEl = cells[1].querySelector('select');
            if (selectEl) {
                const selectedOpt = selectEl.querySelector('option[selected]') || selectEl.options[selectEl.selectedIndex];
                level = selectedOpt ? selectedOpt.textContent.trim() : (selectEl.value || '');
            } else {
                level = cells[1].textContent.trim();
            }

            const rawEventsText = cells[2].textContent.trim();
            const events = rawEventsText
                ? rawEventsText.split(/[;,]/).map(s => s.trim().toUpperCase()).filter(Boolean)
                : [];

            categories.push({
                name: standardName,
                level: level || 'None',
                events: events
            });
        });

        let debugLevelName = '';
        const nameInput = doc.querySelector('input[name*="name" i], input[id*="name" i]');
        if (nameInput && nameInput.value) {
            debugLevelName = nameInput.value.trim();
        }

        return categories.length > 0 ? { categories, debugLevelName } : null;
    } catch (err) {
        console.warn('Error parsing editDebugLevel HTML:', err);
        return null;
    }
}

function buildCategoriesFromDebugLevelRecord(dlRecord) {
    return CATEGORY_CONFIG_DEFS.map(def => {
        const rawLevel = dlRecord[def.field] || 'NONE';
        const levelNormalized = rawLevel.toUpperCase();
        const displayLevel = rawLevel.charAt(0).toUpperCase() + rawLevel.slice(1).toLowerCase();
        const events = getEventsForCategoryAndLevel(def.name, levelNormalized);

        return {
            name: def.name,
            level: displayLevel,
            events: events
        };
    });
}

function saveKnownEvents() {
    try {
        localStorage.setItem('sfqa_debug_known_events', JSON.stringify(Array.from(knownEventsSet)));
    } catch (e) { }
}

function loadKnownEvents() {
    try {
        const stored = localStorage.getItem('sfqa_debug_known_events');
        if (stored) {
            knownEventsSet = new Set(JSON.parse(stored).map(e => String(e).toUpperCase()));
            return;
        }
    } catch (e) { }
    // First run: whatever the default categories contain counts as "known"
    knownEventsSet = new Set(ALL_EVENTS_LIST);
}

// When the debug level changes, events that were never seen before are selected by default,
// otherwise they would silently stay hidden (selection comes from localStorage).
function reconcileSelectedEvents() {
    let changed = false;
    ALL_EVENTS_SET.forEach(ev => {
        if (!knownEventsSet.has(ev)) {
            knownEventsSet.add(ev);
            selectedEventsSet.add(ev);
            changed = true;
        }
    });
    if (changed) {
        saveKnownEvents();
        saveSelectedEvents();
    }
}

function applyDynamicCategories(categoriesList, traceFlag, debugLevelObj, levelNameFromHtml) {
    if (!categoriesList || !categoriesList.length) return;

    // Remember currently open cards
    const openCardNames = new Set();
    $('.cat_card.open').each(function () {
        openCardNames.add($(this).attr('data-cat'));
    });

    DEBUG_CATEGORIES = categoriesList.map(cat => ({
        name: cat.name,
        level: cat.level ? (cat.level.charAt(0).toUpperCase() + cat.level.slice(1).toLowerCase()) : 'None',
        events: Array.isArray(cat.events) ? cat.events : []
    }));

    ALL_EVENTS_LIST = [];
    DEBUG_CATEGORIES.forEach(cat => {
        cat.events.forEach(ev => ALL_EVENTS_LIST.push(ev.toUpperCase()));
    });
    ALL_EVENTS_SET = new Set(ALL_EVENTS_LIST);

    reconcileSelectedEvents();
    renderEventFilters();

    // Restore open state
    openCardNames.forEach(catName => {
        $(`.cat_card[data-cat="${catName}"]`).addClass('open');
    });

    const lvlName = levelNameFromHtml || debugLevelObj?.DeveloperName || debugLevelObj?.MasterLabel || '';
    renderTraceFlagBanner(traceFlag, debugLevelObj, lvlName);

    if (rawLogData) {
        applyFilters();
    }
}

function renderTraceFlagBanner(traceFlag, debugLevelObj, levelNameOverride) {
    const $banner = $('#filterTraceFlagBanner');
    if (!$banner.length) return;

    if (!traceFlag) {
        $banner.removeClass('hide active expired').addClass('none').html(`
            <div class="tf_banner_info" title="No active Trace Flag found for this user in Salesforce. Click Create to configure one.">
                <i class="fa fa-flag-o tf_banner_icon"></i>
                <span class="tf_banner_text">No Trace Flag</span>
            </div>
            <div class="tf_banner_actions">
                <button type="button" class="btn_quick_create_tf" title="Create Debug Log / Trace Flag for this user"><i class="fa fa-plus-circle"></i> Create</button>
            </div>
        `);
        return;
    }

    const levelName = levelNameOverride || debugLevelObj?.DeveloperName || debugLevelObj?.MasterLabel || 'Debug Level';
    const isExpired = traceFlag.ExpirationDate ? (new Date(traceFlag.ExpirationDate) < new Date()) : false;
    const statusText = isExpired ? 'Expired' : 'Active';
    const statusClass = isExpired ? 'expired' : 'active';
    const editUrl = baseUrl ? `${baseUrl}/udd/DebugLevel/editDebugLevel.apexp?traceflag_id=${traceFlag.Id}` : '#';

    let expTimeStr = '';
    if (traceFlag.ExpirationDate) {
        try {
            expTimeStr = Intl.DateTimeFormat('en-IN', {
                month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
            }).format(new Date(traceFlag.ExpirationDate));
        } catch (e) { }
    }

    $banner.removeClass('hide none active expired').addClass(statusClass).html(`
        <div class="tf_banner_info" title="Trace Flag: ${escapeHtml(traceFlag.Id)} | Level: ${escapeHtml(levelName)} | Expires: ${escapeHtml(expTimeStr || 'N/A')}">
            <i class="fa fa-flag tf_banner_icon"></i>
            <span class="tf_banner_name" title="Debug Level Name: ${escapeHtml(levelName)}">${escapeHtml(levelName)}</span>
            <span class="tf_banner_badge ${statusClass}">${statusText}</span>
        </div>
        <div class="tf_banner_actions">
            <a href="${escapeHtml(editUrl)}" target="_blank" class="tf_banner_btn tf_banner_link" title="Open and edit Debug Level in Salesforce Setup (New Tab)">
                <i class="fa fa-external-link"></i>
            </a>
            <button type="button" class="tf_banner_btn btn_refresh_traceflag" title="Reload Debug Level from Salesforce">
                <i class="fa fa-refresh"></i>
            </button>
        </div>
    `);
}

async function fetchAndApplyTraceFlagDebugLevel(targetUserId) {
    if (!baseUrl || !sessionId) {
        console.warn('Cannot fetch TraceFlag: baseUrl or sessionId missing');
        return;
    }
    // Every call gets a sequence number; if a newer call starts, older results are discarded.
    const seq = ++traceFlagSeq;
    const isStale = () => seq !== traceFlagSeq;

    let userId = targetUserId || $('.top_userinfo_inp').val()?.trim();

    if (!userId || !USER_ID_REGEX.test(userId)) {
        if (conn && conn.identity) {
            try {
                const res = await conn.identity();
                if (res && res.user_id) {
                    userId = res.user_id;
                }
            } catch (e) { }
        }
    }
    if (isStale()) return;

    if (!userId || !USER_ID_REGEX.test(userId)) {
        renderTraceFlagBanner(null, null);
        return;
    }

    try {
        const reqOptions = { method: 'GET', headers: authHeaders(), redirect: 'follow' };
        const safeUserId = escSoql(userId);

        let tfRecord = null;
        let tfDebugLevel = null;

        // 1. Relationship query
        try {
            const queryWithRel = `SELECT Id, TracedEntityId, DebugLevelId, StartDate, ExpirationDate, LogType, DebugLevel.Id, DebugLevel.DeveloperName, DebugLevel.MasterLabel, DebugLevel.ApexCode, DebugLevel.ApexProfiling, DebugLevel.Callout, DebugLevel.Database, DebugLevel.System, DebugLevel.Validation, DebugLevel.Visualforce, DebugLevel.Workflow FROM TraceFlag WHERE TracedEntityId='${safeUserId}' ORDER BY ExpirationDate DESC LIMIT 1`;
            const tfRes = await fetch(toolingQueryUrl(queryWithRel), reqOptions);
            const tfData = await tfRes.json();
            if (tfData?.records?.length > 0) {
                tfRecord = tfData.records[0];
                tfDebugLevel = tfRecord.DebugLevel;
            }
        } catch (eRel) {
            console.warn('Relationship query on TraceFlag failed, trying simple query:', eRel);
        }
        if (isStale()) return;

        // 2. Fallback to simple query
        if (!tfRecord) {
            try {
                const querySimple = `SELECT Id, TracedEntityId, DebugLevelId, StartDate, ExpirationDate, LogType FROM TraceFlag WHERE TracedEntityId='${safeUserId}' ORDER BY ExpirationDate DESC LIMIT 1`;
                const tfRes = await fetch(toolingQueryUrl(querySimple), reqOptions);
                const tfData = await tfRes.json();
                if (tfData?.records?.length > 0) {
                    tfRecord = tfData.records[0];
                }
            } catch (eSimple) {
                console.warn('Simple TraceFlag query failed:', eSimple);
            }
        }
        if (isStale()) return;

        if (!tfRecord) {
            console.log('No TraceFlag found for userId:', userId);
            currentTraceFlag = null;
            currentDebugLevel = null;
            renderTraceFlagBanner(null, null);
            return;
        }

        // If DebugLevel was not in relationship, query it directly
        if (!tfDebugLevel && tfRecord.DebugLevelId) {
            try {
                const dlQuery = `SELECT Id, DeveloperName, MasterLabel, ApexCode, ApexProfiling, Callout, Database, System, Validation, Visualforce, Workflow FROM DebugLevel WHERE Id='${escSoql(tfRecord.DebugLevelId)}'`;
                const dlRes = await fetch(toolingQueryUrl(dlQuery), reqOptions);
                const dlData = await dlRes.json();
                if (dlData?.records?.length > 0) {
                    tfDebugLevel = dlData.records[0];
                }
            } catch (eDl) {
                console.warn('DebugLevel query failed:', eDl);
            }
        }
        if (isStale()) return;

        currentTraceFlag = tfRecord;
        currentDebugLevel = tfDebugLevel;

        // 3. Try the exact dynamic page data
        let htmlParsed = null;
        try {
            const pageUrl = baseUrl + '/udd/DebugLevel/editDebugLevel.apexp?traceflag_id=' + encodeURIComponent(tfRecord.Id);
            const pageRes = await fetch(pageUrl, {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + sessionId },
                credentials: 'include'
            });
            if (pageRes.ok) {
                const htmlText = await pageRes.text();
                if (htmlText.includes('editDebugLevel') || htmlText.includes('Debug Level Details') || htmlText.includes('SOQL_EXECUTE_BEGIN')) {
                    htmlParsed = parseDebugLevelHtml(htmlText);
                }
            }
        } catch (ePage) {
            console.warn('Could not fetch editDebugLevel page:', ePage);
        }
        if (isStale()) return;

        if (htmlParsed && htmlParsed.categories && htmlParsed.categories.length > 0) {
            applyDynamicCategories(htmlParsed.categories, tfRecord, tfDebugLevel, htmlParsed.debugLevelName);
            return;
        }

        // 4. Fallback: build categories from Tooling API DebugLevel fields
        if (tfDebugLevel) {
            const dynamicCategories = buildCategoriesFromDebugLevelRecord(tfDebugLevel);
            applyDynamicCategories(dynamicCategories, tfRecord, tfDebugLevel, tfDebugLevel.DeveloperName || tfDebugLevel.MasterLabel);
            return;
        }

        renderTraceFlagBanner(tfRecord, null);
    } catch (err) {
        console.error('Error in fetchAndApplyTraceFlagDebugLevel:', err);
    }
}

function parseLogHeaderLevels(logText) {
    if (!logText) return null;
    const firstLine = logText.split('\n')[0].trim();
    if (!firstLine.includes(';') || !firstLine.includes(',')) return null;

    const parts = firstLine.replace(/^[0-9.]+\s+/, '').split(';');
    const levelsMap = {};
    parts.forEach(p => {
        const [catKey, lvl] = p.split(',');
        if (catKey && lvl) {
            levelsMap[catKey.trim().toUpperCase()] = lvl.trim().toUpperCase();
        }
    });
    return Object.keys(levelsMap).length > 0 ? levelsMap : null;
}

/* ========================================================
   PAGE INIT
   ======================================================== */

$(document).ready(function () {
    $(".spinner-div").hide();
    sessionLogsCache.clear();
    updateLogsCacheBadge();
    try {
        if (typeof Draggable !== 'undefined' && Draggable.create) {
            Draggable.create('.small_popup_1');
        }
    } catch (e) {
        console.warn('Draggable initialization error:', e);
    }
    try {
        const savedTheme = localStorage.getItem('sfqa_debuglogs_theme') || 'light';
        applyTheme(savedTheme);
    } catch (e) { }
    let url = new URL(window.location.href);
    baseUrl = url.searchParams.get('baseUrl');
    setSessionText();
    sessionId = url.searchParams.get('sessionId');
    initialize();
});

$(window).on('beforeunload', function () {
    sessionLogsCache.clear();
});

async function initialize() {
    // Connection
    try {
        conn = await getConnection(baseUrl, sessionId);
    } catch (err) {
        console.warn('getConnection error:', err);
    }

    // Initialize Event Filters
    try {
        loadKnownEvents();
        loadSelectedEvents();
        loadEventOrder();
        renderEventFilters();
    } catch (err) {
        console.error('renderEventFilters error:', err);
    }

    // Initialize Theme
    try {
        const savedTheme = localStorage.getItem('sfqa_debuglogs_theme') || 'light';
        applyTheme(savedTheme);
    } catch (e) { }

    // Initialize Black & White / Color Mode
    try {
        const savedBw = localStorage.getItem('sfqa_debuglogs_bw_mode') === '1';
        applyBwMode(savedBw);
    } catch (e) { }

    // Initialize Sort Headers UI
    try {
        updateSortHeadersUI();
    } catch (e) { }

    try {
        if (localStorage.getItem('sfqa_debug_filters_collapsed') === '1') {
            $('.down_c').addClass('filters-collapsed');
            $('.top_filter_btn').removeClass('is-active');
        } else {
            $('.top_filter_btn').addClass('is-active');
        }
        if (localStorage.getItem('sfqa_debug_logs_collapsed') === '1') {
            $('.down_c').addClass('logs-collapsed');
        }
    } catch (e) { }

    try {
        initColumnResizers();
    } catch (e) {
        console.warn('initColumnResizers error:', e);
    }

    try {
        initScrollbarCursorHandlers();
    } catch (e) {
        console.warn('initScrollbarCursorHandlers error:', e);
    }

    // Restore saved log fetch limit
    try {
        const savedLimit = localStorage.getItem('sfqa_debug_log_limit');
        if (savedLimit) {
            $('.top_limit_select').val(savedLimit);
        }
    } catch (e) { }

    $(document).on('change', '.top_limit_select', function () {
        const val = $(this).val();
        if (val) {
            try { localStorage.setItem('sfqa_debug_log_limit', val); } catch (e) { }
        }
    });

    // Infinite scroll for Apex Logs table
    $('.logs_table_wrapper').on('scroll', function () {
        const el = this;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
            if (!isLoadingOlderLogs && $('.btn_load_more_logs').is(':visible') && !$('.btn_load_more_logs').hasClass('is-loading')) {
                fetchOlderLogs();
            }
        }
    });

    $(document).on('click', '.btn_load_more_logs', function () {
        fetchOlderLogs();
    });

    // Auto-resolve initial user name if userId is in input or from session
    let initialUserId = $('.top_userinfo_inp').val()?.trim();
    if (!initialUserId || !USER_ID_REGEX.test(initialUserId)) {
        try {
            initialUserId = await getEffectiveCurrentUserId();
            if (initialUserId) {
                $('.top_userinfo_inp').val(initialUserId);
            }
        } catch (e) { }
    }

    if (initialUserId && USER_ID_REGEX.test(initialUserId)) {
        fetchAndDisplayUserName(initialUserId);
        fetchAndApplyTraceFlagDebugLevel(initialUserId);
    }

    try {
        loadOrgApexClasses();
    } catch (e) { }

    try {
        await fetchAndApplyOrgDetails();
    } catch (e) { }

    // Auto-fetch latest logs on open so the table is not empty
    try {
        setTimeout(() => {
            if ($('.top_fetchlog_btn').length && !$('.logs_table tbody tr').length) {
                $('.top_fetchlog_btn').click();
            }
        }, 150);
    } catch (e) { }
}

async function getEffectiveCurrentUserId() {
    let inpVal = $('.top_userinfo_inp').val()?.trim();
    if (inpVal && USER_ID_REGEX.test(inpVal)) {
        return inpVal;
    }
    // 1. Direct REST identity endpoint on baseUrl (most reliable with sid cookie, avoids CORS / login.salesforce.com redirect)
    try {
        const reqOptions = { method: 'GET', headers: authHeaders(), redirect: 'follow' };
        const res = await fetch(baseUrl + '/services/data/v59.0/', reqOptions);
        if (res.ok) {
            const data = await res.json();
            if (data && data.identity) {
                const parts = data.identity.split('/');
                const idCandidate = parts[parts.length - 1];
                if (idCandidate && USER_ID_REGEX.test(idCandidate)) {
                    return idCandidate;
                }
            }
        }
    } catch (e) {
        console.warn('REST identity check failed:', e);
    }

    // 2. Chatter users me
    try {
        const reqOptions = { method: 'GET', headers: authHeaders(), redirect: 'follow' };
        const res = await fetch(baseUrl + '/services/data/v59.0/chatter/users/me', reqOptions);
        if (res.ok) {
            const data = await res.json();
            if (data?.id && USER_ID_REGEX.test(data.id)) {
                return data.id;
            }
        }
    } catch (e) { }

    // 3. Fallback to jsforce conn.identity()
    try {
        const c = conn || (await getConnection(baseUrl, sessionId));
        if (c && c.identity) {
            const res = await c.identity();
            if (res?.user_id && USER_ID_REGEX.test(res.user_id)) {
                return res.user_id;
            }
        }
    } catch (e) { }

    return null;
}

function setUserNameBadge(userName, userId) {
    if (userName && String(userName).trim()) {
        const cleanName = String(userName).trim();
        $('.top_username_text').text(cleanName);
        $('.top_username_badge')
            .removeClass('hide')
            .attr('data-id', userId || '')
            .attr('title', `Active Debug Log User: ${cleanName}${userId ? ' (' + userId + ')' : ''} - Click to copy ID`);
    } else {
        $('.top_username_badge').addClass('hide').removeAttr('data-id');
        $('.top_username_text').text('');
    }
}

async function fetchAndDisplayUserName(userId) {
    if (!userId) {
        setUserNameBadge('');
        return;
    }
    if (!USER_ID_REGEX.test(userId)) {
        return;
    }
    if (userRecords && userRecords.length) {
        const u = userRecords.find(usr => usr.Id === userId);
        if (u && u.Name) {
            setUserNameBadge(u.Name, userId);
            return;
        }
    }
    try {
        const reqOptions = { method: 'GET', headers: authHeaders(), redirect: 'follow' };
        const soql = `SELECT Id,Name,Username FROM User WHERE Id='${escSoql(userId)}'`;
        let res = await fetch(baseUrl + '/services/data/v59.0/query/?q=' + encodeURIComponent(soql), reqOptions);
        let data = await res.json();
        if (data?.records?.length && data.records[0]?.Name) {
            setUserNameBadge(data.records[0].Name, userId);
            return;
        }
    } catch (e) {
        console.warn('Could not query user name via REST:', e);
    }
    try {
        if (conn) {
            let uRec = await conn.sobject('User').retrieve(userId);
            if (uRec && uRec.Name) {
                setUserNameBadge(uRec.Name, userId);
            }
        }
    } catch (e2) {
        console.warn('Could not retrieve user via jsforce:', e2);
    }
}

async function getConnection(baseUrl, sessionId) {
    let c = new jsforce.Connection({
        instanceUrl: baseUrl,
        serverUrl: baseUrl,
        sessionId: sessionId
    });
    return c;
}

/* ========================================================
   CREATE DEBUG LOG / TRACE FLAG
   ======================================================== */

async function ensureDebugLevelId() {
    const reqOptions = { method: 'GET', headers: authHeaders(), redirect: 'follow' };
    let records = [];
    try {
        const res = await fetch(toolingQueryUrl('SELECT Id, DeveloperName, MasterLabel FROM DebugLevel'), reqOptions);
        const result = await res.json();
        records = Array.isArray(result?.records) ? result.records : [];
    } catch (e) {
        console.warn('Could not query DebugLevel:', e);
    }

    const TARGET_NAME = 'aLLfINEST';

    // Core categories supported by all Salesforce orgs regardless of optional licenses
    const coreCategorySettings = {
        ApexCode: 'FINEST',
        ApexProfiling: 'FINEST',
        Callout: 'FINEST',
        Database: 'FINEST',
        System: 'FINE',
        Validation: 'INFO',
        Visualforce: 'FINER',
        Workflow: 'FINER'
    };

    // Helper to renew / update category levels on an existing DebugLevel
    async function renewDebugLevel(dlId) {
        try {
            const patchRes = await fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/DebugLevel/' + dlId, {
                method: 'PATCH',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(coreCategorySettings)
            });
            if (patchRes.ok || patchRes.status === 204) {
                return true;
            }
        } catch (e) {
            console.warn('Could not update/renew DebugLevel categories:', e);
        }
        return false;
    }

    // Exact or case-insensitive match for existing DebugLevel
    const exactMatch = records.find(val => (val.DeveloperName || '').toLowerCase() === TARGET_NAME.toLowerCase() || (val.MasterLabel || '').toLowerCase() === TARGET_NAME.toLowerCase());
    if (exactMatch) {
        await renewDebugLevel(exactMatch.Id);
        return exactMatch.Id;
    }

    // Try to create aLLfINEST with standard core categories
    const baseBody = Object.assign({
        DeveloperName: TARGET_NAME,
        MasterLabel: TARGET_NAME
    }, coreCategorySettings);

    try {
        const createRes = await fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/DebugLevel', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(baseBody)
        });
        const newLevel = await createRes.json();
        if (newLevel && newLevel.id) return newLevel.id;

        // In case Salesforce reported duplicate because DeveloperName is case-insensitively unique in DB
        if (Array.isArray(newLevel) && newLevel[0]?.errorCode === 'DUPLICATE_DEVELOPER_NAME') {
            const ciMatch = records.find(val => (val.DeveloperName || '').toLowerCase() === TARGET_NAME.toLowerCase());
            if (ciMatch) {
                await renewDebugLevel(ciMatch.Id);
                return ciMatch.Id;
            }
        }
    } catch (createErr) {
        console.warn('Could not create ' + TARGET_NAME + ' DebugLevel', createErr);
    }

    // Fallbacks
    const devConsoleLevel = records.find(val => val.DeveloperName === 'SFDC_DevConsole');
    if (devConsoleLevel) return devConsoleLevel.Id;
    if (records.length > 0) return records[0].Id;
    return null;
}

$(document).on('click', '.top_createlog_btn', async function () {
    let userId = $('.top_userinfo_inp').val()?.trim();
    if (!userId || !USER_ID_REGEX.test(userId)) {
        userId = await getEffectiveCurrentUserId();
        if (userId) {
            $('.top_userinfo_inp').val(userId);
            fetchAndDisplayUserName(userId);
        }
    }

    if (!userId || !USER_ID_REGEX.test(userId)) {
        $('.snackbar').text('Invalid User ID. Please search or select a user first.');
        showToast();
        return;
    }

    $(".spinner-div").show();
    try {
        const debugLevelId = await ensureDebugLevelId();
        if (!debugLevelId) {
            $('.snackbar').text('Could not configure Debug Level.');
            showToast();
            return;
        }

        fetchAndDisplayUserName(userId);

        const now = new Date();
        // Salesforce limits a trace flag to max 24 hours (1440 min). Stay safely within limit (23h 55m).
        const end = new Date(now.getTime() + (23 * 60 + 55) * 60 * 1000);
        const endDateTime = end.toISOString();
        // StartDate 1 minute in the past so server clock drift never rejects it with "StartDate must not be in the future"
        const startDateTime = new Date(now.getTime() - 60 * 1000).toISOString();

        // Query ALL existing trace flags for this user (DEVELOPER_LOG or USER_DEBUG)
        let existingTfs = [];
        try {
            const exQ = `SELECT Id, LogType, StartDate, ExpirationDate, DebugLevelId FROM TraceFlag WHERE TracedEntityId='${escSoql(userId)}' ORDER BY ExpirationDate DESC`;
            const exRes = await fetch(toolingQueryUrl(exQ), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
            const exData = await exRes.json();
            existingTfs = Array.isArray(exData?.records) ? exData.records : [];
        } catch (e) {
            console.warn('Could not query existing TraceFlags:', e);
        }

        let updatedOrCreated = false;
        let errorMessage = null;

        // 1. If an existing trace flag exists, update/extend it.
        // CRITICAL NOTE: Do NOT include StartDate in PATCH! StartDate is not updatable in Salesforce Tooling API!
        if (existingTfs.length > 0) {
            const primaryTf = existingTfs[0];
            try {
                const patchRes = await fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/TraceFlag/' + primaryTf.Id, {
                    method: 'PATCH',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        ExpirationDate: endDateTime,
                        DebugLevelId: debugLevelId
                    })
                });
                if (patchRes.ok || patchRes.status === 204) {
                    updatedOrCreated = true;
                } else {
                    const errBody = await patchRes.json().catch(() => null);
                    errorMessage = errBody?.[0]?.message || ('Failed to update trace flag (' + patchRes.status + ')');
                }
            } catch (patchErr) {
                errorMessage = patchErr?.message || 'Error updating trace flag';
            }
        }

        // 2. If update failed or no existing trace flag, delete any old/conflicting trace flags for this user and create a clean fresh one
        if (!updatedOrCreated) {
            for (const tf of existingTfs) {
                try {
                    await fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/TraceFlag/' + tf.Id, {
                        method: 'DELETE',
                        headers: authHeaders(),
                        redirect: 'follow'
                    });
                } catch (delErr) { }
            }

            // POST fresh trace flag
            try {
                const postRes = await fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/TraceFlag', {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        TracedEntityId: userId,
                        LogType: 'DEVELOPER_LOG',
                        StartDate: startDateTime,
                        ExpirationDate: endDateTime,
                        DebugLevelId: debugLevelId
                    })
                });
                const result = await postRes.json();
                if (result && result.id) {
                    updatedOrCreated = true;
                    errorMessage = null;
                } else if (Array.isArray(result) && result[0]?.message) {
                    errorMessage = result[0].message;
                } else {
                    errorMessage = 'Failed to create trace flag.';
                }
            } catch (postErr) {
                errorMessage = postErr?.message || 'Error creating trace flag';
            }
        }

        if (!updatedOrCreated && errorMessage) {
            $('.snackbar').text(errorMessage);
            showToast();
        } else {
            const currentName = $('.top_username_text').text()?.trim();
            $('.snackbar').text(currentName ? `Active Debug Log enabled for ${currentName} (24h).` : 'Active Debug Log enabled (24h).');
            showToast();
            await fetchAndApplyTraceFlagDebugLevel(userId);
        }
    } catch (error) {
        console.error('Create log error:', error);
        $('.snackbar').text('Something went wrong creating trace flag.');
        showToast();
    } finally {
        $(".spinner-div").hide();
    }
});

function updateLogsCacheBadge() {
    const count = sessionLogsCache.size;
    if (count > 0) {
        $('.logs_cache_badge')
            .removeClass('hide')
            .html(`<span class="badge_count">${count}</span> <span class="badge_text_saved">saved</span>`)
            .attr('title', `${count} log${count > 1 ? 's' : ''} saved in current session. Safe from Salesforce org log deletions until cleared or reloaded.`);
    } else {
        $('.logs_cache_badge').addClass('hide').empty();
    }
}

/* ========================================================
   THEME SWITCHING LOGIC
   ======================================================== */
function applyTheme(theme) {
    if (theme === 'dark') {
        $('body').addClass('theme-dark').removeClass('theme-light');
        $('.top_theme_btn').find('i').removeClass('fa-moon-o').addClass('fa-sun-o');
        $('.top_theme_btn').find('span').text('Light');
        $('.top_theme_btn').attr('title', 'Switch to Light Theme (Alt+T)');
    } else {
        $('body').removeClass('theme-dark').addClass('theme-light');
        $('.top_theme_btn').find('i').removeClass('fa-sun-o').addClass('fa-moon-o');
        $('.top_theme_btn').find('span').text('Dark');
        $('.top_theme_btn').attr('title', 'Switch to Dark Theme (Alt+T)');
    }
    if (apexClassAceEditor) {
        apexClassAceEditor.setTheme(theme === 'dark' ? 'ace/theme/tomorrow_night' : 'ace/theme/chrome');
    }
    try {
        localStorage.setItem('sfqa_debuglogs_theme', theme);
    } catch (e) { }
}

/* ========================================================
   BLACK & WHITE / COLOR MODE LOGIC
   ======================================================== */
function applyBwMode(isBw) {
    const $btn = $('.top_bw_btn');
    if (isBw) {
        $('body').addClass('mode-bw');
        $btn.addClass('is-active');
        $btn.find('i').removeClass('fa-adjust').addClass('fa-paint-brush');
        $btn.find('span').text('Color');
        $btn.attr('title', 'Switch to Color Mode (Alt+B)');
    } else {
        $('body').removeClass('mode-bw');
        $btn.removeClass('is-active');
        $btn.find('i').removeClass('fa-paint-brush').addClass('fa-adjust');
        $btn.find('span').text('B&W');
        $btn.attr('title', 'Switch to Black & White Mode (Alt+B)');
    }
    try {
        localStorage.setItem('sfqa_debuglogs_bw_mode', isBw ? '1' : '0');
    } catch (e) { }
}

/* ========================================================
   APEX LOGS SORTING & GROUPING DATA MODEL
   ======================================================== */
let logGroups = [];
const selectedLogCheckboxes = new Set();
let currentSortColumn = 'LastModifiedDate';
let currentSortOrder = 'ASC';
let currentRenderedRecords = [];

// Ensure reload always defaults to Date Time ascending (oldest first)
try {
    localStorage.removeItem('sfqa_debug_sort_col');
    localStorage.removeItem('sfqa_debug_sort_order');
} catch (e) { }

function sortRecordsList(records) {
    if (!records || !records.length) return [];
    const isAsc = currentSortOrder === 'ASC';
    return records.slice().sort((a, b) => {
        if (currentSortColumn === 'LogLength') {
            const valA = Number(a.LogLength) || 0;
            const valB = Number(b.LogLength) || 0;
            if (valA !== valB) {
                return isAsc ? valA - valB : valB - valA;
            }
            return new Date(b.LastModifiedDate) - new Date(a.LastModifiedDate);
        } else {
            const timeA = new Date(a.LastModifiedDate).getTime() || 0;
            const timeB = new Date(b.LastModifiedDate).getTime() || 0;
            return isAsc ? timeA - timeB : timeB - timeA;
        }
    });
}

function updateSortHeadersUI() {
    $('.sortable_col').each(function () {
        const key = $(this).attr('data-sort-key');
        const $icon = $(this).find('.sort_icon');
        const colLabel = key === 'LogLength' ? 'Length' : 'Date Time';
        if (key === currentSortColumn) {
            $(this).addClass('sorted_active');
            $icon.removeClass('fa-sort fa-sort-asc fa-sort-desc').addClass(currentSortOrder === 'ASC' ? 'fa-sort-asc active' : 'fa-sort-desc active');
            $(this).attr('title', `Sorted by ${colLabel} (${currentSortOrder === 'ASC' ? 'Ascending' : 'Descending'}). Click to reverse.`);
        } else {
            $(this).removeClass('sorted_active');
            $icon.removeClass('fa-sort-asc fa-sort-desc active').addClass('fa-sort');
            $(this).attr('title', `Click to sort by ${colLabel}`);
        }
    });
}

function getLogGroupsStorageKey() {
    const userId = $('.top_userinfo_inp').val()?.trim() || 'all';
    return `sfqa_debuglogs_groups_${userId}`;
}

function loadLogGroups() {
    try {
        const key = getLogGroupsStorageKey();
        const stored = localStorage.getItem(key);
        if (stored) {
            logGroups = JSON.parse(stored);
            if (!Array.isArray(logGroups)) logGroups = [];
        } else {
            logGroups = [];
        }
    } catch (e) {
        logGroups = [];
    }
}

function saveLogGroups() {
    try {
        const key = getLogGroupsStorageKey();
        localStorage.setItem(key, JSON.stringify(logGroups));
    } catch (e) {
        console.warn('Failed to save log groups to localStorage', e);
    }
}

function updateGroupSelectionUI() {
    const count = selectedLogCheckboxes.size;
    if (count > 0) {
        $('.btn_group_selected').removeClass('hide');
        $('.group_sel_count').text(count);
        $('.btn_text_clear').text(`Clear (${count})`);
        $('.btn_clear_cached_logs').attr('title', `Clear ${count} selected log${count === 1 ? '' : 's'} from saved list`);
        $('.btn_text_del_server').text(`Delete Org (${count})`);
        $('.btn_delete_server_logs').attr('title', `Delete ${count} selected log${count === 1 ? '' : 's'} from Salesforce server`);
    } else {
        $('.btn_group_selected').addClass('hide');
        $('.group_sel_count').text('0');
        $('.btn_text_clear').text('Clear');
        $('.btn_clear_cached_logs').attr('title', 'Clear all locally saved logs');
        $('.btn_text_del_server').text('Delete Org Logs');
        $('.btn_delete_server_logs').attr('title', 'Delete all my debug logs from Salesforce server');
    }
    const totalVisible = $('.log_row_checkbox').length;
    const checkedVisible = $('.log_row_checkbox:checked').length;
    if (totalVisible > 0 && checkedVisible === totalVisible) {
        $('.log_master_checkbox').prop('checked', true).prop('indeterminate', false);
    } else if (checkedVisible > 0) {
        $('.log_master_checkbox').prop('checked', false).prop('indeterminate', true);
    } else {
        $('.log_master_checkbox').prop('checked', false).prop('indeterminate', false);
    }
}

function buildLogRowHtml(rec, groupId = null, isHidden = false, srNo = '') {
    let dateString = Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(rec.LastModifiedDate));
    const formattedLength = (rec.LogLength || 0).toLocaleString();
    const userName = rec.LogUser?.Name || '';
    const operation = rec.Operation || '';
    const status = rec.Status || '';
    const isSuccess = String(status).toLowerCase() === 'success';
    const statusClass = isSuccess ? 'status_success' : 'status_fail';
    const isGrouped = Boolean(groupId);
    const hiddenClass = isHidden ? 'hide' : '';
    const isChecked = selectedLogCheckboxes.has(rec.Id);

    return `
        <tr class="tr tr_${rec.Id} ${isGrouped ? 'tr_grouped' : ''} ${hiddenClass}" data-id="${rec.Id}" ${isGrouped ? `data-group-id="${groupId}"` : ''}>
            <td class="td td_srno" title="Log #${srNo}">${srNo}</td>
            <td class="td td_checkbox">
                <input type="checkbox" class="log_row_checkbox" data-id="${rec.Id}" ${isChecked ? 'checked' : ''} />
            </td>
            <td class="td td_length td_id" data-id="${rec.Id}" title="${rec.LogLength} bytes">${formattedLength}</td>
            <td class="td td_date">${dateString}</td>
            <td class="td td_operation" title="${escapeHtml(operation)}">${escapeHtml(operation)}</td>
            <td class="td td_user" title="${escapeHtml(userName)}">${escapeHtml(userName)}</td>
            <td class="td td_status">
                <span class="status_pill ${statusClass}">${escapeHtml(status)}</span>
            </td>
        </tr>
    `;
}

function buildGroupHeaderHtml(group, groupRecords) {
    const isCollapsed = Boolean(group.collapsed);
    const chevronIcon = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
    const folderIcon = isCollapsed ? 'fa-folder' : 'fa-folder-open';

    return `
        <tr class="log_group_header_tr ${isCollapsed ? 'is-collapsed' : ''}" data-group-id="${group.id}">
            <td colspan="7" class="log_group_header_td">
                <div class="log_group_header_inner">
                    <button type="button" class="btn_toggle_group" title="Expand/Collapse Group">
                        <i class="fa ${chevronIcon}"></i>
                    </button>
                    <span class="log_group_folder_icon"><i class="fa ${folderIcon}"></i></span>
                    <span class="log_group_title" title="${escapeHtml(group.name)}">${escapeHtml(group.name)}</span>
                    <span class="log_group_badge">${groupRecords.length} log${groupRecords.length > 1 ? 's' : ''}</span>
                    <div class="log_group_actions">
                        <button type="button" class="btn_group_action btn_rename_group" title="Rename Group" data-group-id="${group.id}">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button type="button" class="btn_group_action btn_ungroup" title="Ungroup all logs in this group" data-group-id="${group.id}">
                            <i class="fa fa-chain-broken"></i> <span>Ungroup</span>
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function renderLogsTable(records) {
    if (!records || !records.length) {
        currentRenderedRecords = [];
        $('.log_table_body').empty();
        logsIdArray = [];
        updateLogsCacheBadge();
        $('.logs_load_more_wrap').addClass('hide');
        updateGroupSelectionUI();
        updateSortHeadersUI();
        return;
    }
    currentRenderedRecords = records;
    const sortedRecords = sortRecordsList(records);
    logsIdArray = [];

    const recordsMap = new Map();
    sortedRecords.forEach(rec => {
        recordsMap.set(rec.Id, rec);
        logsIdArray.push(rec.Id);
    });

    loadLogGroups();

    const groupRecordsMap = new Map();
    const logIdToGroup = new Map();

    logGroups.forEach(group => {
        let groupRecords = [];
        group.logIds.forEach(id => {
            if (recordsMap.has(id)) {
                groupRecords.push(recordsMap.get(id));
            }
        });

        if (groupRecords.length > 0) {
            groupRecords = sortRecordsList(groupRecords);
            groupRecordsMap.set(group.id, groupRecords);
            group.logIds.forEach(id => {
                logIdToGroup.set(id, group);
            });
        }
    });

    const renderedGroupIds = new Set();
    let finalTableHtml = '';
    let logIndex = 0;

    // Render logs in sorted order, embedding groups exactly at their first occurrence
    sortedRecords.forEach(rec => {
        const group = logIdToGroup.get(rec.Id);
        if (group) {
            if (!renderedGroupIds.has(group.id)) {
                renderedGroupIds.add(group.id);
                const groupRecords = groupRecordsMap.get(group.id) || [];
                finalTableHtml += buildGroupHeaderHtml(group, groupRecords);
                groupRecords.forEach(gRec => {
                    logIndex++;
                    finalTableHtml += buildLogRowHtml(gRec, group.id, Boolean(group.collapsed), logIndex);
                });
            }
        } else {
            logIndex++;
            finalTableHtml += buildLogRowHtml(rec, null, false, logIndex);
        }
    });

    // Safety fallback
    logGroups.forEach(group => {
        if (!renderedGroupIds.has(group.id) && groupRecordsMap.has(group.id)) {
            renderedGroupIds.add(group.id);
            const groupRecords = groupRecordsMap.get(group.id) || [];
            finalTableHtml += buildGroupHeaderHtml(group, groupRecords);
            groupRecords.forEach(gRec => {
                logIndex++;
                finalTableHtml += buildLogRowHtml(gRec, group.id, Boolean(group.collapsed), logIndex);
            });
        }
    });

    $('.log_table_body').html(finalTableHtml);
    updateLogsCacheBadge();
    updateGroupSelectionUI();
    updateSortHeadersUI();
}

function prefetchLogBodies(records) {
    if (!records || !records.length) return;
    // Prefetch top 10 most recent logs to avoid overloading network/server
    records.slice(0, 10).forEach(rec => {
        const cached = sessionLogsCache.get(rec.Id);
        if (!cached || !cached.body) {
            getLogData(rec.Id).then(body => {
                if (body) {
                    const existing = sessionLogsCache.get(rec.Id) || {};
                    sessionLogsCache.set(rec.Id, { ...existing, metadata: rec, body: body, fetchedAt: Date.now() });
                    indexHeapAssignments(body, false);
                    updateLogsCacheBadge();
                }
            }).catch(err => {
                console.warn('Background prefetch failed for log ' + rec.Id, err);
            });
        }
    });
}

async function getLogDataWithCache(logId) {
    if (!logId) return '';
    const cached = sessionLogsCache.get(logId);
    if (cached && cached.body) {
        return cached.body;
    }
    const body = await getLogData(logId);
    if (body) {
        const existing = sessionLogsCache.get(logId) || {};
        sessionLogsCache.set(logId, { ...existing, body: body, fetchedAt: Date.now() });
        indexHeapAssignments(body, false);
        updateLogsCacheBadge();
    }
    return body;
}

function loadMoreButtonHtml() {
    return '<button type="button" class="btn_load_more_logs" title="Fetch older logs from Salesforce"><i class="fa fa-arrow-circle-o-down"></i> <span class="btn_text_load_more">Load Older Logs</span></button>';
}

$(document).on('click', '.top_fetchlog_btn', async function () {
    $('.down_c').removeClass('logs-collapsed');
    try { localStorage.setItem('sfqa_debug_logs_collapsed', '0'); } catch (e) { }

    const $fetchBtn = $(this);
    const $fetchIcon = $fetchBtn.find('i');
    const startBtnLoading = () => {
        $fetchBtn.addClass('is-fetching').prop('disabled', true);
        $fetchIcon.addClass('fa-spin');
    };
    const stopBtnLoading = () => {
        $fetchBtn.removeClass('is-fetching').prop('disabled', false);
        $fetchIcon.removeClass('fa-spin');
    };

    startBtnLoading();

    try {
        let userId = $('.top_userinfo_inp').val()?.trim();

        if (!userId || !USER_ID_REGEX.test(userId)) {
            const effId = await getEffectiveCurrentUserId();
            if (effId) {
                userId = effId;
                $('.top_userinfo_inp').val(userId);
                fetchAndDisplayUserName(userId);
            }
        }

        $(".spinner-div").show();
        const selectedLimit = parseInt($('.top_limit_select').val() || localStorage.getItem('sfqa_debug_log_limit') || '100', 10);
        
        let soql;
        if (userId && USER_ID_REGEX.test(userId)) {
            soql = `SELECT Id,LastModifiedDate,LogUser.Name,Application,Status,Operation,LogLength,LogUserId FROM ApexLog WHERE LogUserId='${escSoql(userId)}' ORDER BY LastModifiedDate DESC LIMIT ${selectedLimit}`;
        } else {
            soql = `SELECT Id,LastModifiedDate,LogUser.Name,Application,Status,Operation,LogLength,LogUserId FROM ApexLog ORDER BY LastModifiedDate DESC LIMIT ${selectedLimit}`;
        }

        let result;
        try {
            const response = await fetch(toolingQueryUrl(soql, 'v44.0'), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
            result = await response.json();
        } catch (error) {
            console.log('$fetchLogs: error', error);
            stopBtnLoading();
            $(".spinner-div").hide();
            if (sessionLogsCache.size > 0) {
                const cachedRecords = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
                renderLogsTable(cachedRecords);
                $('.snackbar').text(`Network issue. Displaying ${cachedRecords.length} locally saved logs.`);
                showToast();
            }
            return;
        }

        stopBtnLoading();

        if (!result?.records?.length) {
            $(".spinner-div").hide();
            $('.logs_load_more_wrap').addClass('hide');
            // If Salesforce has 0 logs, preserve our session cache!
            if (sessionLogsCache.size > 0) {
                const cachedRecords = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
                renderLogsTable(cachedRecords);
                $('.snackbar').text(`Salesforce has no logs. Preserving ${cachedRecords.length} locally saved logs.`);
                showToast();
                return;
            }
            $('.snackbar').text(Array.isArray(result) && result[0]?.message ? result[0].message : 'Logs not available.');
            showToast();
            if (userId && USER_ID_REGEX.test(userId)) {
                fetchAndDisplayUserName(userId);
                fetchAndApplyTraceFlagDebugLevel(userId);
            }
            return;
        }

        const logUserName = result.records[0]?.LogUser?.Name;
        if (logUserName && userId) {
            setUserNameBadge(logUserName, userId);
        } else if (userId && USER_ID_REGEX.test(userId)) {
            fetchAndDisplayUserName(userId);
        }
        if (userId && USER_ID_REGEX.test(userId)) {
            fetchAndApplyTraceFlagDebugLevel(userId);
        }

        // Add or update metadata in sessionLogsCache
        result.records.forEach(rec => {
            const existing = sessionLogsCache.get(rec.Id) || {};
            sessionLogsCache.set(rec.Id, { ...existing, metadata: rec, fetchedAt: existing.fetchedAt || Date.now() });
        });

        const allRecords = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
        renderLogsTable(allRecords);

        // Auto-prefetch log bodies in background (top 10 only)
        prefetchLogBodies(result.records);
        $(".spinner-div").hide();

        if (result.records.length >= selectedLimit) {
            $('.logs_load_more_wrap').html(loadMoreButtonHtml()).removeClass('hide');
        } else {
            $('.logs_load_more_wrap').html('<span class="logs_end_badge">All available server logs loaded</span>').removeClass('hide');
        }
    } catch (err) {
        stopBtnLoading();
        $(".spinner-div").hide();
        console.error('Error in fetch logs:', err);
    }
});

async function fetchOlderLogs() {
    if (isLoadingOlderLogs) return;
    const userId = $('.top_userinfo_inp').val()?.trim();

    const allRecords = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
    if (!allRecords.length) return;

    allRecords.sort((a, b) => new Date(b.LastModifiedDate) - new Date(a.LastModifiedDate));
    const oldestRec = allRecords[allRecords.length - 1];
    const oldestMs = new Date(oldestRec?.LastModifiedDate).getTime();
    if (!oldestMs) return;

    const selectedLimit = parseInt($('.top_limit_select').val() || localStorage.getItem('sfqa_debug_log_limit') || '100', 10);
    const $loadBtn = $('.btn_load_more_logs');
    $loadBtn.addClass('is-loading').html('<i class="fa fa-spinner fa-spin"></i> Loading older logs...');
    isLoadingOlderLogs = true;

    try {
        // ISO format (e.g. 2026-10-29T18:00:00.000Z) is valid in SOQL; the whole query is URL-encoded (the old '+0000' offset broke the URL).
        // '<=' is used so logs sharing the same timestamp are not skipped; the Map cache dedupes by Id.
        const oldestIso = new Date(oldestMs).toISOString();
        let soql;
        if (userId && USER_ID_REGEX.test(userId)) {
            soql = `SELECT Id,LastModifiedDate,LogUser.Name,Application,Status,Operation,LogLength,LogUserId FROM ApexLog WHERE LogUserId='${escSoql(userId)}' AND LastModifiedDate<=${oldestIso} ORDER BY LastModifiedDate DESC LIMIT ${selectedLimit}`;
        } else {
            soql = `SELECT Id,LastModifiedDate,LogUser.Name,Application,Status,Operation,LogLength,LogUserId FROM ApexLog WHERE LastModifiedDate<=${oldestIso} ORDER BY LastModifiedDate DESC LIMIT ${selectedLimit}`;
        }

        const res = await fetch(toolingQueryUrl(soql, 'v44.0'), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
        const data = await res.json();
        const records = Array.isArray(data?.records) ? data.records : [];
        const newRecords = records.filter(r => !sessionLogsCache.has(r.Id));

        if (newRecords.length > 0) {
            newRecords.forEach(rec => {
                sessionLogsCache.set(rec.Id, { metadata: rec, fetchedAt: Date.now() });
            });
            const updatedAll = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
            renderLogsTable(updatedAll);
            prefetchLogBodies(newRecords);
        }

        if (newRecords.length === 0 || records.length < selectedLimit) {
            $('.logs_load_more_wrap').html('<span class="logs_end_badge">All available server logs loaded</span>').removeClass('hide');
        } else {
            $('.logs_load_more_wrap').html(loadMoreButtonHtml()).removeClass('hide');
        }
    } catch (err) {
        console.error('Error fetching older logs:', err);
        $loadBtn.removeClass('is-loading').html('<i class="fa fa-exclamation-triangle"></i> Failed to load older logs. Click to retry');
    } finally {
        isLoadingOlderLogs = false;
    }
}

$(document).on('click', '.log_table tbody tr.tr', async function (e) {
    if ($(e.target).closest('.td_checkbox, input[type="checkbox"]').length) {
        return;
    }
    const $row = $(this);
    $('.log_table tbody tr.tr').removeClass('tr_selected');
    $('.log_table .td').removeClass('td_selected');
    $row.addClass('tr_selected');
    $row.find('.td').addClass('td_selected');

    let logId = $row.attr('data-id') || $row.find('.td_id').attr('data-id');
    if (!logId) return;
    const rowUserName = $row.find('.td_user').text()?.trim();
    if (rowUserName) {
        setUserNameBadge(rowUserName, $('.top_userinfo_inp').val()?.trim());
    }
    logId = logId.trim();
    currentLogId = logId;
    areAllNodesExpanded = false;
    $('.toggle_all_nodes_btn').removeClass('is-active');
    $('.toggle_all_nodes_btn i').removeClass('fa-compress').addClass('fa-expand');
    $('.toggle_all_nodes_btn .btn_expand_all_text').text('Expand All');
    $(".spinner-div").show();
    try {
        let logData = await getLogDataWithCache(logId);
        if (currentLogId !== logId) return; // user clicked another log meanwhile
        rawLogData = logData || '';
        if (!currentTraceFlag && logData) {
            const headerLevels = parseLogHeaderLevels(logData);
            if (headerLevels) {
                const logCategories = CATEGORY_CONFIG_DEFS.map(def => {
                    const key1 = def.name.toUpperCase().replace(/\s+/g, '_');
                    const key2 = def.field.toUpperCase();
                    const key3 = (def.name === 'Database') ? 'DB' : '';
                    const lvl = headerLevels[key1] || headerLevels[key2] || (key3 ? headerLevels[key3] : '') || 'NONE';
                    const displayLevel = lvl.charAt(0).toUpperCase() + lvl.slice(1).toLowerCase();
                    const events = getEventsForCategoryAndLevel(def.name, lvl);
                    return {
                        name: def.name,
                        level: displayLevel,
                        events: events
                    };
                });
                applyDynamicCategories(logCategories, null, null, 'From Log Header');
            }
        }
        applyFilters();
    } catch (err) {
        console.error('Error fetching log:', err);
        $('.snackbar').text('Failed to load log.');
        showToast();
    } finally {
        $(".spinner-div").hide();
    }
});

function showSpinner() {
    $(".spinner-div").show();
}

function hideSpinner() {
    $(".spinner-div").hide();
}

/* ========================================================
   USER SEARCH
   ======================================================== */

$(document).on('keydown', '.top_userinfo_inp', async function (e) {
    let charCode = (e.which) ? e.which : e.keyCode;
    if (charCode != 13) return;

    let recordID = $(this).val().trim();
    if (!recordID) return;
    let selected = $('.top_select').val();

    // Direct User ID Lookup (e.g. starts with 005)
    if (/^005[a-zA-Z0-9]{12,15}$/.test(recordID)) {
        showSpinner();
        try {
            let query = `SELECT Id, Name, Email, Username, IsActive, Profile.Name FROM User WHERE Id = '${escSoql(recordID)}'`;
            await fetchRecordsXMLSOAP(query);
            if (userRecords?.length) {
                setUserNameBadge(userRecords[0].Name, userRecords[0].Id);
            } else {
                await fetchAndDisplayUserName(recordID);
            }
            await fetchAndApplyTraceFlagDebugLevel(recordID);
        } finally {
            hideSpinner();
        }
        return;
    }

    if (selected == 'USERNAME') {
        if (!recordID.includes('@')) {
            $('.snackbar').text('Enter a full username (e.g. name@company.com).');
            showToast();
            return;
        }
        showSpinner();
        try {
            const soql = `SELECT Id,Name,Username FROM User WHERE Username='${escSoql(recordID)}'`;
            const response = await fetch(baseUrl + '/services/data/v59.0/query/?q=' + encodeURIComponent(soql), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
            const result = await response.json();
            if (!result?.records?.length) {
                $('.snackbar').text('user not found.');
                showToast();
            } else {
                $('.top_userinfo_inp').val(result.records[0]?.Id);
                setUserNameBadge(result.records[0]?.Name, result.records[0]?.Id);
                fetchAndApplyTraceFlagDebugLevel(result.records[0]?.Id);
            }
        } catch (error) {
            console.log('$userSearch: error', error);
            $('.snackbar').text('User search failed.');
            showToast();
        } finally {
            hideSpinner();
        }
    } else if (selected == 'NAME') {
        showSpinner();
        try {
            const safe = escSoql(recordID);
            let query = `SELECT Id, Name, Email, Username, IsActive, Profile.Name FROM User WHERE Name LIKE '%${safe}%' LIMIT 100`;
            if (recordID == 's.a') {
                query = `SELECT Id, Name, Email, Username, IsActive, Profile.Name FROM User WHERE Profile.Name = 'System Administrator'`;
            } else if (recordID == 's.a.a') {
                query = `SELECT Id, Name, Email, Username, IsActive, Profile.Name FROM User WHERE Profile.Name = 'System Administrator' And IsActive = True`;
            } else if (recordID == 's.a.i') {
                query = `SELECT Id, Name, Email, Username, IsActive, Profile.Name FROM User WHERE Profile.Name = 'System Administrator' And IsActive = False`;
            } else if (recordID == 'i.u') {
                query = `SELECT Id, Name, Email, Username, IsActive, Profile.Name FROM User WHERE Email LIKE '%.invalid%'`;
            } else if (recordID == 'i.u.a') {
                query = `SELECT Id, Name, Email, Username, IsActive, Profile.Name FROM User WHERE Profile.Name = 'System Administrator' And Email LIKE '%.invalid%'`;
            }
            userRecords = null;
            await fetchRecordsXMLSOAP(query);
            if (!userRecords?.length) {
                $('.snackbar').text('No Users including provided name.');
                showToast();
            } else {
                let tBody = '';
                userRecords.forEach(val => {
                    tBody += `<tr class="tbody_1_tr tbody_1_tr_1 tr_${escapeHtml(val.Id)}">
                        <td class="td_1 td_1_1 ${escapeHtml(val.Id)} th_1_Id" data-id="${escapeHtml(val.Id)}">
                            ${escapeHtml(val.Id)}
                        </td>
                        <td class="td_1 td_1_2 th_1_data">
                            ${escapeHtml(val.Name)}
                        </td>
                        <td class="td_1 td_1_3 th_1_data">
                            ${escapeHtml(val.Username)}
                        </td>
                        <td class="td_1 td_1_4 th_1_data">
                            ${escapeHtml(val.ProfileName)}
                        </td>
                        <td class="td_1 td_1_5 th_1_data">
                            ${escapeHtml(val.Email)}
                        </td>
                        <td class="td_1 td_1_6 th_1_data">
                            ${escapeHtml(val.IsActive)}
                        </td>
                    </tr>`;
                });
                $('.d_outer').addClass('blur');
                $('.small_popup_1').removeClass('hide');
                $('.tbody_1').html(tBody);
            }
        } finally {
            hideSpinner();
        }
    }
});

$(document).on('click', '.th_1_Id', function () {
    let userId = $(this).attr('data-id');
    let user = userRecords?.find(usr => usr.Id == userId);
    if (user) {
        $('.d_outer').removeClass('blur');
        $('.small_popup_1').addClass('hide');
        $('.top_userinfo_inp').val(userId);
        setUserNameBadge(user.Name, userId);
        copyToCLipboard(userId, false);
        fetchAndApplyTraceFlagDebugLevel(userId);
    }
});

// Automatically select all text on click or focus so user can immediately type a new ID/Name
$(document).on('click focus', '.top_userinfo_inp, .top_debugsearch_inp, .viewer_text_search_inp, .filter_search_inp', function () {
    $(this).select();
});
$(document).on('change blur', '.top_userinfo_inp', function () {
    let val = $(this).val()?.trim();
    if (val && USER_ID_REGEX.test(val)) {
        fetchAndDisplayUserName(val);
        fetchAndApplyTraceFlagDebugLevel(val);
    }
});

$(document).on('click', '.btn_refresh_traceflag', async function (e) {
    e.stopPropagation();
    const $icon = $(this).find('i');
    $icon.addClass('fa-spin');
    const userId = $('.top_userinfo_inp').val()?.trim();
    await fetchAndApplyTraceFlagDebugLevel(userId);
    $icon.removeClass('fa-spin');
    $('.snackbar').text('Refreshed Debug Level from Trace Flag.');
    showToast();
});

$(document).on('click', '.btn_quick_create_tf', function (e) {
    e.stopPropagation();
    $('.top_createlog_btn').click();
});

$(document).on('click', '.top_username_badge', function () {
    const uid = $(this).attr('data-id') || $('.top_userinfo_inp').val()?.trim();
    if (uid) {
        copyToCLipboard(uid, true);
    }
});

$(document).on('click', '.th_1_data', function () {
    let text = $(this).text().trim();
    copyToCLipboard(text, true);
});

function copyToCLipboard(value, showSnackbar) {
    let text = value;
    navigator.clipboard.writeText(text).then(function () {
        if (showSnackbar) {
            $('.snackbar').text(text);
            showToast();
        }
    }, function (err) {
        console.error('error copying');
    });
}

function closeUserSearchModal() {
    $('.d_outer').removeClass('blur');
    $('.small_popup_1').addClass('hide');
}

$(document).on('click', '.close-icon_1, .small_popup_1_close_div', function (e) {
    e.stopPropagation();
    closeUserSearchModal();
});

$(document).on('click', '.small_popup_1', function (e) {
    if ($(e.target).hasClass('small_popup_1')) {
        closeUserSearchModal();
    }
});

$(document).on('keydown', function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        if (!$('.small_popup_1').hasClass('hide')) {
            closeUserSearchModal();
        }
    }
});

async function fetchRecordsXMLSOAP(query) {
    const endpoint = baseUrl + "/services/Soap/c/59.0";
    const soapRequest =
        '<?xml version="1.0" encoding="utf-8" ?>' +
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:enterprise.soap.sforce.com">' +
        '  <soapenv:Header>' +
        '    <urn:SessionHeader>' +
        '      <urn:sessionId>' + escXml(sessionId) + '</urn:sessionId>' +
        '    </urn:SessionHeader>' +
        '  </soapenv:Header>' +
        '  <soapenv:Body>' +
        '    <urn:query>' +
        '      <urn:queryString>' + escXml(query) + '</urn:queryString>' +
        '    </urn:query>' +
        '  </soapenv:Body>' +
        '</soapenv:Envelope>';

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "text/xml",
                "SOAPAction": "urn:enterprise.soap.sforce.com/query",
            },
            body: soapRequest,
        });
        const xmlResponse = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");
        let exceptionCode = xmlDoc.querySelector('exceptionCode');
        let exceptionMessage = xmlDoc.querySelector('exceptionMessage');
        if (exceptionCode) {
            // (the old code referenced popup elements that don't exist in the HTML)
            userRecords = [];
            $('.snackbar').text(exceptionMessage ? exceptionMessage.textContent : exceptionCode.textContent);
            showToast();
            hideSpinner();
        } else {
            prepareRecordsARRAY(xmlResponse);
        }
    } catch (error) {
        console.error("Error:", error);
        userRecords = [];
    }
}

function prepareRecordsARRAY(xmlResponse) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");
    const records = [];
    const txt = (node, sel) => {
        const n = node.querySelector(sel);
        return n ? n.textContent : '';
    };
    let recordNodes = xmlDoc.querySelectorAll('records');
    recordNodes.forEach(recordNode => {
        const profileNode = recordNode.querySelector('Profile');
        records.push({
            Id: txt(recordNode, 'Id'),
            Name: txt(recordNode, 'Name'),
            Username: txt(recordNode, 'Username'),
            Email: txt(recordNode, 'Email'),
            IsActive: txt(recordNode, 'IsActive'),
            ProfileName: profileNode ? txt(profileNode, 'Name') : ''
        });
    });
    userRecords = [...records];
}

function getObjects() {
    fetch(baseUrl + '/services/data/v59.0/sobjects/', { method: 'GET', headers: authHeaders(), redirect: 'follow' }).then(response => response.text()).then(result => {
        console.log('$res: ', JSON.parse(result));
    }).catch(error => {
        console.log('$getObjects: error', error);
    });
}

/* ========================================================
   SEARCH ACROSS ALL LOGS
   ======================================================== */

function clearSearchHits(clearViewerSearch = false) {
    $('.td_id').removeClass('search_hit');
    if (clearViewerSearch && $('.viewer_text_search_inp').val()) {
        $('.viewer_text_search_inp').val('');
        $('.viewer_text_search_clear').addClass('hide');
        applyFilters();
    }
}

// Automatically clear red highlights the moment search text is removed or cleared
// Show either 'X' (when input has text) or 'Enter' hint badge (when empty), never both at the same time
$(document).on('input keyup change', '.top_debugsearch_inp', function (e) {
    const val = $(this).val().trim();
    if (!val) {
        clearSearchHits(true);
        $('.top_search_clear').addClass('hide');
        $('.search_kbd_hint').removeClass('hide');
    } else {
        $('.top_search_clear').removeClass('hide');
        $('.search_kbd_hint').addClass('hide');
    }
});

// Click 'x' button to clear search and remove red highlights immediately
$(document).on('click', '.top_search_clear', function () {
    $('.top_debugsearch_inp').val('');
    $(this).addClass('hide');
    $('.search_kbd_hint').removeClass('hide');
    clearSearchHits(true);
    $('.top_debugsearch_inp').focus();
});

$(document).on('keydown', '.top_debugsearch_inp', async function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        $(this).val('');
        clearSearchHits(true);
        $('.top_search_clear').addClass('hide');
        $('.search_kbd_hint').removeClass('hide');
        return;
    }

    let charCode = (e.which) ? e.which : e.keyCode;
    if (charCode != 13) return;

    if (!logsIdArray || !logsIdArray.length) {
        $('.snackbar').text('Fetch logs first.');
        showToast();
        return;
    }

    const searchedText = $(this).val().trim();
    clearSearchHits();
    if (!searchedText) {
        $('.top_search_clear').addClass('hide');
        $('.search_kbd_hint').removeClass('hide');
        return;
    }

    $(".spinner-div").show();
    try {
        const needle = searchedText.toLowerCase();
        const found = new Set();

        await Promise.all(logsIdArray.map(async (logId) => {
            try {
                let logData = await getLogDataWithCache(logId);
                if (logData && logData.toLowerCase().includes(needle)) {
                    found.add(logId);
                }
            } catch (err) {
                console.warn('Error reading log data during search for ' + logId, err);
            }
        }));

        // Keep table order (promises finish in random order)
        const foundRecords = logsIdArray.filter(id => found.has(id));
        foundRecords.forEach(recId => {
            $(`.log_table_body tr.tr[data-id="${recId}"] .td_id`).addClass('search_hit');
            $('.tr_' + recId + ' .td_id').addClass('search_hit');
        });

        if (foundRecords.length) {
            const firstMatchedId = foundRecords[0];

            // If the first matched log is in a collapsed group, uncollapse it so it is visible
            const $targetRow = $(`.log_table_body tr.tr[data-id="${firstMatchedId}"]`);
            if ($targetRow.length) {
                const groupId = $targetRow.attr('data-group-id');
                if (groupId) {
                    const group = logGroups.find(g => g.id === groupId);
                    if (group && group.collapsed) {
                        group.collapsed = false;
                        saveLogGroups();
                        $(`.log_table_body tr.tr_grouped[data-group-id="${groupId}"]`).removeClass('hide');
                        $(`.log_group_header_tr[data-group-id="${groupId}"]`).removeClass('is-collapsed');
                        $(`.log_group_header_tr[data-group-id="${groupId}"] .btn_toggle_group i`).removeClass('fa-chevron-right').addClass('fa-chevron-down');
                        $(`.log_group_header_tr[data-group-id="${groupId}"] .log_group_folder_icon i`).removeClass('fa-folder').addClass('fa-folder-open');
                    }
                }

                // Update row selection in table
                $('.log_table tbody tr.tr').removeClass('tr_selected');
                $('.log_table .td').removeClass('td_selected');
                $targetRow.addClass('tr_selected');
                $targetRow.find('.td').addClass('td_selected');

                // Smoothly scroll the table to bring the matched row into view
                try {
                    $targetRow[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } catch (e) { }

                const rowUserName = $targetRow.find('.td_user').text()?.trim();
                if (rowUserName) {
                    setUserNameBadge(rowUserName, $('.top_userinfo_inp').val()?.trim());
                }
            } else {
                $('.log_table tbody tr.tr').removeClass('tr_selected');
                $('.log_table .td').removeClass('td_selected');
                $('.tr_' + firstMatchedId).addClass('tr_selected').find('.td').addClass('td_selected');
            }

            currentLogId = firstMatchedId;
            areAllNodesExpanded = false;
            $('.toggle_all_nodes_btn').removeClass('is-active');
            $('.toggle_all_nodes_btn i').removeClass('fa-compress').addClass('fa-expand');
            $('.toggle_all_nodes_btn .btn_expand_all_text').text('Expand All');

            const logData = await getLogDataWithCache(firstMatchedId);
            rawLogData = logData || '';

            if (!currentTraceFlag && logData) {
                const headerLevels = parseLogHeaderLevels(logData);
                if (headerLevels) {
                    const logCategories = CATEGORY_CONFIG_DEFS.map(def => {
                        const key1 = def.name.toUpperCase().replace(/\s+/g, '_');
                        const key2 = def.field.toUpperCase();
                        const key3 = (def.name === 'Database') ? 'DB' : '';
                        const lvl = headerLevels[key1] || headerLevels[key2] || (key3 ? headerLevels[key3] : '') || 'NONE';
                        const displayLevel = lvl.charAt(0).toUpperCase() + lvl.slice(1).toLowerCase();
                        const events = getEventsForCategoryAndLevel(def.name, lvl);
                        return {
                            name: def.name,
                            level: displayLevel,
                            events: events
                        };
                    });
                    applyDynamicCategories(logCategories, null, null, 'From Log Header');
                }
            }

            // Also filter the viewer by the searched text so matches are visible
            $('.viewer_text_search_inp').val(searchedText);
            $('.viewer_text_search_clear').removeClass('hide');
            applyFilters();

            // Auto-scroll viewer to the first matching highlighted line
            setTimeout(() => {
                const $firstHighlight = $('.d_down_viewer_content .log_highlight').first();
                if ($firstHighlight.length) {
                    $firstHighlight[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
            }, 60);

            const srNo = $targetRow.find('.td_srno').text()?.trim() || '';
            $('.snackbar').text(`Found in ${foundRecords.length} log${foundRecords.length > 1 ? 's' : ''}.${srNo ? ` Loaded log #${srNo}.` : ''}`);
        } else {
            $('.snackbar').text('No log contains that text.');
        }
        showToast();
    } finally {
        $(".spinner-div").hide();
    }
});

// Clear Locally Saved Logs (Supports selected logs or all)
$(document).on('click', '.btn_clear_cached_logs', function () {
    const selectedIds = Array.from(selectedLogCheckboxes);

    // If specific logs are selected, clear only those selected logs
    if (selectedIds.length > 0) {
        selectedIds.forEach(id => {
            sessionLogsCache.delete(id);
            selectedLogCheckboxes.delete(id);
        });

        // Rebuild current records list
        const remainingRecords = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
        renderLogsTable(remainingRecords);
        updateLogsCacheBadge();
        updateGroupSelectionUI();

        // If the currently viewed log was one of the cleared ones, reset the viewer
        if (selectedIds.includes(currentLogId)) {
            rawLogData = '';
            currentLogId = null;
            $('.d_down_textarea').val('');
            setViewerEmptyState('Selected log was cleared. Select another log to view.');
            $('.filter_stats_badge').text('No log selected').attr('title', 'No log selected');
            $('.lines_badge').text('Showing 0 / 0 lines (0.0%) * 0 events');
        }

        $('.snackbar').text(`Cleared ${selectedIds.length} selected log${selectedIds.length === 1 ? '' : 's'} from saved list.`);
        showToast();
        return;
    }

    // Otherwise, clear ALL locally saved logs
    if (sessionLogsCache.size === 0 && (!logsIdArray || logsIdArray.length === 0)) {
        $('.snackbar').text('No saved logs to clear.');
        showToast();
        return;
    }
    const count = sessionLogsCache.size;
    sessionLogsCache.clear();
    logsIdArray = [];
    currentRenderedRecords = [];
    selectedLogCheckboxes.clear();
    updateGroupSelectionUI();
    $('.log_table_body').empty();
    updateLogsCacheBadge();
    rawLogData = '';
    currentLogId = null;
    $('.d_down_textarea').val('// Logs cleared. Click "Fetch Logs" to retrieve new logs.');
    setViewerEmptyState('Logs cleared. Click "Fetch Logs" to retrieve new logs.');
    $('.filter_stats_badge').text('No log selected').attr('title', 'No log selected');
    $('.lines_badge').text('Showing 0 / 0 lines (0.0%) * 0 events');
    $('.filter_badge').text('All');
    $('.snackbar').text(`Cleared all ${count} locally saved logs.`);
    showToast();
});

// Delete ApexLog Records from the Salesforce server (Supports selected logs or all user logs)
$(document).on('click', '.btn_delete_server_logs', async function () {
    const userId = $('.top_userinfo_inp').val()?.trim();
    if (!userId || !USER_ID_REGEX.test(userId)) {
        $('.snackbar').text('User ID required to delete server logs.');
        showToast();
        return;
    }

    const selectedIds = Array.from(selectedLogCheckboxes);
    const userName = $('.top_username_text').text()?.trim() || userId;

    let confirmed = false;
    if (selectedIds.length > 0) {
        confirmed = confirm(`Delete ${selectedIds.length} selected log${selectedIds.length === 1 ? '' : 's'} from Salesforce server?`);
    } else {
        confirmed = confirm(`Are you sure you want to delete ALL ApexLog records for "${userName}" from the Salesforce server?\n\n(Note: Your locally saved logs in this viewer will remain intact until you clear them or reload).`);
    }
    if (!confirmed) return;

    $(".spinner-div").show();
    try {
        let deleteCount = 0;
        let failCount = 0;

        if (selectedIds.length > 0) {
            // Delete only the checked logs
            for (let i = 0; i < selectedIds.length; i += 10) {
                const chunk = selectedIds.slice(i, i + 10);
                const results = await Promise.all(chunk.map(async logId => {
                    try {
                        const delRes = await fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/ApexLog/' + logId, {
                            method: 'DELETE',
                            headers: authHeaders(),
                            redirect: 'follow'
                        });
                        return delRes.ok || delRes.status === 204;
                    } catch (delErr) {
                        console.warn('Error deleting server log ' + logId, delErr);
                        return false;
                    }
                }));
                results.forEach((ok, idx) => {
                    const id = chunk[idx];
                    if (ok) {
                        deleteCount++;
                        sessionLogsCache.delete(id);
                        selectedLogCheckboxes.delete(id);
                    } else {
                        failCount++;
                    }
                });
            }

            // Re-render local table to reflect deleted logs
            const remainingRecords = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
            renderLogsTable(remainingRecords);
            updateLogsCacheBadge();
            updateGroupSelectionUI();

            if (selectedIds.includes(currentLogId)) {
                rawLogData = '';
                currentLogId = null;
                $('.d_down_textarea').val('');
                setViewerEmptyState('Selected log was deleted. Select another log to view.');
                $('.filter_stats_badge').text('No log selected').attr('title', 'No log selected');
                $('.lines_badge').text('Showing 0 / 0 lines (0.0%) * 0 events');
            }

            $('.snackbar').text(`Deleted ${deleteCount} selected log${deleteCount === 1 ? '' : 's'} from Salesforce server.` + (failCount ? ` ${failCount} failed.` : ''));
            showToast();
            return;
        }

        // Delete all logs for user in rounds
        const maxRounds = 25;
        for (let round = 0; round < maxRounds; round++) {
            const soql = `SELECT Id FROM ApexLog WHERE LogUserId='${escSoql(userId)}' LIMIT 200`;
            const res = await fetch(toolingQueryUrl(soql), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
            const data = await res.json();
            const batch = Array.isArray(data?.records) ? data.records : [];
            if (batch.length === 0) break;

            let deletedThisRound = 0;
            for (let i = 0; i < batch.length; i += 10) {
                const chunk = batch.slice(i, i + 10);
                const results = await Promise.all(chunk.map(async rec => {
                    try {
                        const delRes = await fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/ApexLog/' + rec.Id, {
                            method: 'DELETE',
                            headers: authHeaders(),
                            redirect: 'follow'
                        });
                        return delRes.ok || delRes.status === 204;
                    } catch (delErr) {
                        console.warn('Error deleting server log ' + rec.Id, delErr);
                        return false;
                    }
                }));
                results.forEach(ok => {
                    if (ok) { deleteCount++; deletedThisRound++; } else { failCount++; }
                });
            }
            if (deletedThisRound === 0) break;
        }

        if (deleteCount === 0 && failCount === 0) {
            $('.snackbar').text('No logs found on Salesforce server for this user.');
        } else {
            $('.snackbar').text(`Deleted ${deleteCount} log${deleteCount === 1 ? '' : 's'} from Salesforce server.` + (failCount ? ` ${failCount} failed.` : ''));
        }
        showToast();
    } catch (err) {
        console.error('Error deleting server logs:', err);
        $('.snackbar').text('Failed to delete logs from server.');
        showToast();
    } finally {
        $(".spinner-div").hide();
    }
});

async function getLogData(logId) {
    try {
        const response = await fetch(baseUrl + '/services/data/v44.0/tooling/sobjects/ApexLog/' + encodeURIComponent(logId) + '/Body', {
            method: 'GET',
            headers: authHeaders(),
            redirect: 'follow'
        });
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.status);
        }
        return await response.text();
    } catch (error) {
        console.log('$getLogData: error', error);
        throw error;
    }
}

let timeout;

function showToast() {
    if (!timeout) {
        timeout = true;
        $('.snackbar').addClass('show');
        setTimeout(function () {
            $('.snackbar').removeClass('show');
            timeout = false;
        }, 2000);
    }
}

async function getCurrentUserRecordId() {
    const c = await getConnection(baseUrl, sessionId);
    const res = await c.identity();
    return res.user_id;
}

function parseOrgAndEnvFromUrl(urlStr) {
    let raw = (urlStr || '').trim();
    let host = raw.replace(/^https?:\/\//i, '').split('/')[0];
    let orgName = '';
    let env = 'Production';

    const lowerHost = host.toLowerCase();
    if (lowerHost.includes('.sandbox.')) {
        let beforeSb = host.substring(0, lowerHost.indexOf('.sandbox.'));
        let parts = beforeSb.split('--');
        orgName = parts[0];
        let sbName = (parts[parts.length - 1] || '').trim();
        if (sbName.toLowerCase() === 'uat') env = 'UAT';
        else if (sbName.toLowerCase() === 'qa') env = 'QA';
        else if (sbName.toLowerCase() === 'staging') env = 'Staging';
        else if (sbName.toLowerCase() === 'sandbox' || !sbName) env = 'Sandbox';
        else env = `Sandbox (${sbName.toUpperCase()})`;
    } else if (lowerHost.includes('--')) {
        let parts = host.split('.')[0].split('--');
        orgName = parts[0];
        let sbName = (parts[parts.length - 1] || '').trim();
        if (sbName.toLowerCase() === 'uat') env = 'UAT';
        else if (sbName.toLowerCase() === 'qa') env = 'QA';
        else if (sbName.toLowerCase() === 'staging') env = 'Staging';
        else if (sbName.toLowerCase() === 'c' || sbName.toLowerCase() === 'vf') env = 'Production';
        else env = `Sandbox (${sbName.toUpperCase()})`;
    } else if (lowerHost.includes('.scratch.')) {
        orgName = host.split('.')[0];
        env = 'Scratch Org';
    } else {
        orgName = host.split('.')[0];
        env = 'Production';
    }

    orgName = orgName.replace(/-dev-ed$/i, '').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
    return { orgName, env };
}

// ---------------------------------------------------------------------------
// Window-title centering
// The OS title bar is left-aligned, so we pad the title with invisible
// spaces until the "ORG - ENV" text sits at the exact center of the window.
// Everything is measured at runtime, so it works for any org / environment
// name (Production, Sandbox, UAT, QA, Scratch, long or short names, etc.).
// ---------------------------------------------------------------------------
const TITLE_FONT = '12px "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif';
const TITLE_PREFIX = 'Debug Logs';
// Distance from the window's left edge to where the title text starts
// (window border + favicon + gap). Tweak live from the console with
// setTitleLeftOffset(px) if your OS theme differs; the value is remembered.
const TITLE_LEFT_OFFSET_DEFAULT = 18.0;
// true  -> center on the whole window width (true center)
// false -> center only in the area left of the min/max/close buttons
const TITLE_CENTER_ON_FULL_WINDOW = true;
const TITLE_CAPTION_BUTTONS_WIDTH = 138.0;

function getTitleFontCanvasContext() {
    try {
        const canvas = getTitleFontCanvasContext._canvas || (getTitleFontCanvasContext._canvas = document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        ctx.font = TITLE_FONT;
        return ctx;
    } catch (e) {
        return null;
    }
}

function getTitleLeftOffset() {
    try {
        const v = parseFloat(localStorage.getItem('sfqa_title_left_offset'));
        if (!isNaN(v)) return v;
    } catch (e) { }
    return TITLE_LEFT_OFFSET_DEFAULT;
}

window.setTitleLeftOffset = function (px) {
    try { localStorage.setItem('sfqa_title_left_offset', String(px)); } catch (e) { }
    updatePageTitle();
};

// Builds a run of invisible spacer characters whose total width is as close
// as possible to `distance` px (NBSP ~3.5px, thin space ~2px, hair space ~1px
// => sub-pixel accuracy instead of the +/-1.75px error of NBSP alone).
function buildTitleSpacer(ctx, distance) {
    const NBSP = '\u00A0';
    const candidates = ['\u00A0', '\u2009', '\u200A'];
    const widths = candidates
        .map(ch => ({ ch, w: ctx ? ctx.measureText(ch).width : 0 }))
        .filter(x => x.w > 0.3);
    if (!widths.length) return NBSP.repeat(Math.max(1, Math.round(distance / 3.51)));
    widths.sort((a, b) => b.w - a.w);

    let remaining = Math.max(0, distance);
    let out = '';
    widths.forEach((x, i) => {
        const isLast = i === widths.length - 1;
        const n = isLast ? Math.round(remaining / x.w) : Math.floor(remaining / x.w);
        if (n > 0) {
            out += x.ch.repeat(n);
            remaining -= n * x.w;
        }
    });
    return out || NBSP;
}

function updatePageTitle() {
    const prefix = TITLE_PREFIX;
    const centerText = orgDisplayName ? `${orgDisplayName} - ${orgEnvironment}` : orgEnvironment;
    const plainTitle = `${prefix} - ${centerText}`;

    try {
        // macOS already centers window titles natively; padding would break it.
        if (/Mac/i.test(navigator.platform || navigator.userAgent || '')) {
            document.title = plainTitle;
            return;
        }

        const ctx = getTitleFontCanvasContext();
        if (!ctx) { document.title = plainTitle; return; }

        // outerWidth = full window width including title bar (innerWidth is only the page area)
        const winWidth = window.outerWidth || window.innerWidth || screen.availWidth || 1920;

        const prefixWidth = ctx.measureText(prefix).width;
        const centerWidth = ctx.measureText(centerText).width;

        const usableWidth = TITLE_CENTER_ON_FULL_WINDOW
            ? winWidth
            : Math.max(300, winWidth - TITLE_CAPTION_BUTTONS_WIDTH);

        // Left edge where the org text must start so its middle is at the window center
        const targetX = (usableWidth / 2) - (centerWidth / 2);
        const startX = getTitleLeftOffset() + prefixWidth;
        const spaceDistance = targetX - startX;

        // Not enough room to center (very narrow window): fall back to plain title
        if (spaceDistance < 8) { document.title = plainTitle; return; }

        document.title = prefix + buildTitleSpacer(ctx, spaceDistance) + centerText;
    } catch (e) {
        document.title = plainTitle;
    }
}

function setOrgDetails(name, type) {
    if (name) orgDisplayName = String(name).trim().toUpperCase();
    if (type) orgEnvironment = String(type).trim();
    updatePageTitle();
}

$(window).on('resize', function () {
    updatePageTitle();
});

function setSessionText() {
    const parsed = parseOrgAndEnvFromUrl(baseUrl);
    orgDisplayName = parsed.orgName || 'SALESFORCE';
    orgEnvironment = parsed.env || 'Production';
    updatePageTitle();
}

async function fetchAndApplyOrgDetails() {
    try {
        if (!baseUrl) return;
        const soql = 'SELECT Id, Name, OrganizationType, IsSandbox, InstanceName FROM Organization LIMIT 1';
        let orgRecord = null;

        if (conn && conn.query) {
            try {
                const res = await conn.query(soql);
                if (res && res.records && res.records.length > 0) {
                    orgRecord = res.records[0];
                }
            } catch (e) { }
        }

        if (!orgRecord) {
            const res = await fetch(baseUrl + '/services/data/v59.0/query/?q=' + encodeURIComponent(soql), {
                method: 'GET',
                headers: authHeaders(),
                redirect: 'follow'
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.records && data.records.length > 0) {
                    orgRecord = data.records[0];
                }
            }
        }

        if (orgRecord) {
            if (orgRecord.IsSandbox) {
                if (orgEnvironment === 'Production') {
                    orgEnvironment = 'Sandbox';
                }
            } else {
                orgEnvironment = 'Production';
            }
            updatePageTitle();
        }
    } catch (e) {
        console.warn('Failed to fetch Organization details', e);
    }
}

function openUserRecord() {
    fetch(baseUrl + "/services/data/v59.0/", { method: 'GET', headers: authHeaders(), redirect: 'follow' }).then(response => response.json()).then(result => {
        let identity = result.identity;
        identity = identity.substring(identity.lastIndexOf('/') + 1);
        console.log('$identity: ', identity);
    }).catch(error => {
        console.log('$openUserRecord: error', error);
    });
}

// ==========================================
// EVENT FILTERING ENGINE & UI CONTROLLERS
// ==========================================

/* ========================================================
   EVENT ORDER PERSISTENCE (per-category custom ordering)
   ======================================================== */

let eventOrderMap = {}; // { catName: [ev1, ev2, ...] }

function saveEventOrder() {
    try {
        localStorage.setItem('sfqa_debug_event_order', JSON.stringify(eventOrderMap));
    } catch (e) { }
}

function loadEventOrder() {
    try {
        const stored = localStorage.getItem('sfqa_debug_event_order');
        if (stored) {
            eventOrderMap = JSON.parse(stored);
            return;
        }
    } catch (e) { }
    eventOrderMap = {};
}

function getOrderedEvents(catName, events) {
    if (!events || events.length === 0) return [];
    const customOrder = eventOrderMap[catName];
    if (!customOrder || customOrder.length === 0) {
        return [...events].sort((a, b) => a.localeCompare(b));
    }
    const orderIndex = {};
    customOrder.forEach((ev, i) => orderIndex[ev.toUpperCase()] = i);
    const inOrder = [];
    const notInOrder = [];
    events.forEach(ev => {
        if (orderIndex.hasOwnProperty(ev.toUpperCase())) {
            inOrder.push(ev);
        } else {
            notInOrder.push(ev);
        }
    });
    inOrder.sort((a, b) => orderIndex[a.toUpperCase()] - orderIndex[b.toUpperCase()]);
    notInOrder.sort((a, b) => a.localeCompare(b));
    return [...inOrder, ...notInOrder];
}

function setCustomEventOrder(catName, orderedEvents) {
    eventOrderMap[catName] = orderedEvents.map(e => e.toUpperCase());
    saveEventOrder();
}

function sortCategoryAlphabetically(catName) {
    const cat = DEBUG_CATEGORIES.find(c => c.name === catName);
    if (!cat || !cat.events || cat.events.length === 0) return;
    const sorted = [...cat.events].sort((a, b) => a.localeCompare(b));
    setCustomEventOrder(catName, sorted);

    const $card = $(`.cat_card[data-cat="${catName}"]`);
    const $eventsContainer = $card.find('.cat_card_events');
    let html = '';
    sorted.forEach(ev => {
        html += `
            <label class="event_item" draggable="true" data-event="${escapeHtml(ev)}" data-cat="${escapeHtml(catName)}">
                <span class="event_drag_handle" title="Drag to reorder"><i class="fa fa-bars"></i></span>
                <input type="checkbox" class="event_checkbox" value="${escapeHtml(ev)}" data-cat="${escapeHtml(catName)}" />
                <span class="event_name">${escapeHtml(ev)}</span>
            </label>
        `;
    });
    $eventsContainer.html(html);
    syncCheckboxesUI();
    initEventDragAndDrop();
}

/* ========================================================
   DRAG AND DROP FOR EVENT ITEMS
   ======================================================== */

let dragSrcEl = null;
let dragCatName = null;

function initEventDragAndDrop() {
    const $body = $('.filter_panel_body');
    $body.off('dragstart.eventdnd dragover.eventdnd dragenter.eventdnd dragleave.eventdnd drop.eventdnd dragend.eventdnd');

    $body.on('dragstart.eventdnd', '.event_item[draggable="true"]', function (e) {
        dragSrcEl = this;
        dragCatName = $(this).attr('data-cat');
        $(this).addClass('event_dragging');
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        e.originalEvent.dataTransfer.setData('text/plain', $(this).attr('data-event'));
    });

    $body.on('dragover.eventdnd', '.event_item[draggable="true"]', function (e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';
        if ($(this).attr('data-cat') !== dragCatName) return;

        const $this = $(this);
        const rect = this.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        $this.closest('.cat_card_events').find('.event_item').removeClass('event_drop_above event_drop_below');
        if (e.originalEvent.clientY < midY) {
            $this.addClass('event_drop_above');
        } else {
            $this.addClass('event_drop_below');
        }
    });

    $body.on('dragenter.eventdnd', '.event_item[draggable="true"]', function (e) {
        e.preventDefault();
    });

    $body.on('dragleave.eventdnd', '.event_item[draggable="true"]', function (e) {
        $(this).removeClass('event_drop_above event_drop_below');
    });

    $body.on('drop.eventdnd', '.event_item[draggable="true"]', function (e) {
        e.stopPropagation();
        e.preventDefault();

        const $target = $(this);
        if (dragSrcEl === this || $target.attr('data-cat') !== dragCatName) {
            cleanupDragState();
            return;
        }

        const $container = $target.closest('.cat_card_events');
        const $dragItem = $(dragSrcEl);
        const isAbove = $target.hasClass('event_drop_above');

        if (isAbove) {
            $dragItem.insertBefore($target);
        } else {
            $dragItem.insertAfter($target);
        }

        const newOrder = [];
        $container.find('.event_item').each(function () {
            newOrder.push($(this).attr('data-event'));
        });
        setCustomEventOrder(dragCatName, newOrder);
        cleanupDragState();
    });

    $body.on('dragend.eventdnd', '.event_item', function (e) {
        cleanupDragState();
    });
}

function cleanupDragState() {
    $('.event_item').removeClass('event_dragging event_drop_above event_drop_below');
    dragSrcEl = null;
    dragCatName = null;
}

/* ========================================================
   RENDER EVENT FILTERS (with sort button + drag handles)
   ======================================================== */

function renderEventFilters() {
    let html = '';
    const openCardNames = new Set();
    $('.cat_card.open').each(function () {
        openCardNames.add($(this).attr('data-cat'));
    });

    if (Object.keys(eventOrderMap).length === 0) {
        loadEventOrder();
    }

    DEBUG_CATEGORIES.forEach((cat) => {
        let levelClass = 'level_' + (cat.level || '').toLowerCase();
        let levelText = (cat.level || 'NONE').toUpperCase();
        let total = cat.events ? cat.events.length : 0;
        let isOpen = openCardNames.has(cat.name) ? 'open' : '';

        html += `
            <div class="cat_card ${isOpen}" data-cat="${escapeHtml(cat.name)}">
                <div class="cat_card_header">
                    <div class="cat_header_left">
                        <i class="fa fa-chevron-right cat_chevron"></i>
                        <span class="cat_title">${escapeHtml(cat.name)}</span>
                        <span class="cat_level_badge ${escapeHtml(levelClass)}">${escapeHtml(levelText)}</span>
                    </div>
                    <div class="cat_header_right">
                        <span class="cat_count_badge" data-cat="${escapeHtml(cat.name)}">0/${total}</span>
                        <button type="button" class="btn_sort_cat" data-cat="${escapeHtml(cat.name)}" title="Sort events A -> Z">
                            <i class="fa fa-sort-alpha-asc"></i>
                        </button>
                        <input type="checkbox" class="cat_checkbox" data-cat="${escapeHtml(cat.name)}" title="Select / Deselect all in ${escapeHtml(cat.name)}" ${total === 0 ? 'disabled' : ''} />
                    </div>
                </div>
                <div class="cat_card_events">
        `;

        if (total === 0) {
            html += `<div class="cat_no_events">No events logged at ${escapeHtml(levelText)} level</div>`;
        } else {
            const orderedEvents = getOrderedEvents(cat.name, cat.events);
            orderedEvents.forEach(ev => {
                html += `
                    <label class="event_item" draggable="true" data-event="${escapeHtml(ev)}" data-cat="${escapeHtml(cat.name)}">
                        <span class="event_drag_handle" title="Drag to reorder"><i class="fa fa-bars"></i></span>
                        <input type="checkbox" class="event_checkbox" value="${escapeHtml(ev)}" data-cat="${escapeHtml(cat.name)}" />
                        <span class="event_name">${escapeHtml(ev)}</span>
                    </label>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;
    });

    $('.filter_panel_body').html(html);
    syncCheckboxesUI();
    initEventDragAndDrop();
}
function syncCheckboxesUI() {
    $('.event_checkbox').each(function () {
        const ev = $(this).val();
        const isChecked = selectedEventsSet.has(ev.toUpperCase());
        $(this).prop('checked', isChecked);
    });

    DEBUG_CATEGORIES.forEach(cat => {
        let catEvents = (cat.events || []).map(e => e.toUpperCase());
        let selectedInCat = catEvents.filter(e => selectedEventsSet.has(e)).length;
        let totalInCat = catEvents.length;

        $(`.cat_count_badge[data-cat="${cat.name}"]`).text(`${selectedInCat}/${totalInCat}`);

        let catCheckbox = $(`.cat_checkbox[data-cat="${cat.name}"]`);
        if (totalInCat === 0) {
            catCheckbox.prop('checked', false).prop('indeterminate', false);
        } else if (selectedInCat === totalInCat) {
            catCheckbox.prop('checked', true).prop('indeterminate', false);
        } else if (selectedInCat === 0) {
            catCheckbox.prop('checked', false).prop('indeterminate', false);
        } else {
            catCheckbox.prop('checked', false).prop('indeterminate', true);
        }
    });

    // Update global top bar badge (count only events that exist in the current categories)
    let selectedVisible = 0;
    ALL_EVENTS_SET.forEach(ev => { if (selectedEventsSet.has(ev)) selectedVisible++; });
    if (ALL_EVENTS_SET.size > 0 && selectedVisible === ALL_EVENTS_SET.size) {
        $('.filter_badge').text('All');
    } else if (selectedVisible === 0) {
        $('.filter_badge').text('None');
    } else {
        $('.filter_badge').text(`${selectedVisible}`);
    }

    // Restore active preset button highlight (e.g. Custom)
    const activePreset = loadActivePreset();
    if (activePreset) {
        $('.filter_preset_chip').removeClass('active');
        $(`.filter_preset_chip[data-preset="${activePreset}"]`).addClass('active');
    }
}

function saveSelectedEvents() {
    try {
        localStorage.setItem('sfqa_debug_selected_events', JSON.stringify(Array.from(selectedEventsSet)));
    } catch (e) {
        console.error('Error saving events to localStorage', e);
    }
}

function loadSelectedEvents() {
    try {
        const stored = localStorage.getItem('sfqa_debug_selected_events');
        if (stored) {
            const arr = JSON.parse(stored);
            selectedEventsSet = new Set(arr.map(e => e.toUpperCase()));
            return;
        }
    } catch (e) {
        console.error('Error loading events from localStorage', e);
    }
    // Default: all events selected
    selectedEventsSet = new Set(ALL_EVENTS_LIST.map(e => e.toUpperCase()));
}

// ==========================================
// APEX & JSON OBJECT INSPECTOR ENGINE
// ==========================================

let isFormattedViewMode = true;
let areAllNodesExpanded = false;

function isEscaped(str, index) {
    let count = 0;
    for (let i = index - 1; i >= 0 && str[i] === '\\'; i--) {
        count++;
    }
    return (count % 2) === 1;
}

function findTopLevelSeparator(text, startIndex, closeChar) {
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    let inQuote = null;
    for (let k = startIndex; k < text.length; k++) {
        const c = text[k];
        if (inQuote) {
            if (c === inQuote && !isEscaped(text, k)) inQuote = null;
            continue;
        }
        if (c === '"' || c === "'") {
            inQuote = c;
            continue;
        }
        if (c === '(') parenDepth++;
        else if (c === ')') { if (parenDepth > 0) parenDepth--; }
        else if (c === '[') bracketDepth++;
        else if (c === ']') { if (bracketDepth > 0) bracketDepth--; }
        else if (c === '{') braceDepth++;
        else if (c === '}') {
            if (braceDepth > 0) braceDepth--;
            else if (parenDepth === 0 && bracketDepth === 0) break;
        }
        else if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
            if (c === '=' || c === ':') return k;
            if (c === ',' || c === closeChar) break;
        }
    }
    return -1;
}

function parseApexDebugValue(text) {
    let index = 0;
    const len = text.length;

    function skipWhitespace() {
        while (index < len && /\s/.test(text[index])) {
            index++;
        }
    }

    function peek() {
        skipWhitespace();
        return index < len ? text[index] : null;
    }

    function parseValue(parentCloseChar) {
        skipWhitespace();
        if (index >= len) return null;

        // 1. SObject or Custom Class: TypeName:{ ... } or TypeName:[ ... ]
        const identMatch = text.slice(index, index + 200).match(/^([A-Za-z0-9_]+)(:[\{\[])/);
        if (identMatch) {
            const typeName = identMatch[1];
            const delimiter = identMatch[2]; // ":{" or ":["
            index += identMatch[0].length;
            if (delimiter === ':{') {
                const fields = parseKeyValueList('}');
                return {
                    __kind: 'sobject',
                    __type: typeName,
                    fields: fields
                };
            } else {
                const props = parseKeyValueList(']');
                return {
                    __kind: 'class',
                    __type: typeName,
                    fields: props
                };
            }
        }

        // 2. Map or JSON Object: { ... }
        if (text[index] === '{') {
            index++;
            return parseMapOrObject('}');
        }

        // 3. List / Set: ( ... )
        if (text[index] === '(') {
            const savedIndex = index;
            index++;
            const items = parseList(')');
            const p = peek();
            const validFollow = p === ',' || p === parentCloseChar || p === ')' || p === ']' || p === null;
            if (validFollow) {
                return {
                    __kind: 'list',
                    __type: 'List',
                    items: items
                };
            }
            // Not a valid list/set follow token! Backtrack and parse as primitive string (e.g. phone number)
            index = savedIndex;
        }

        // 4. JSON Array or square bracket list: [ ... ]
        if (text[index] === '[') {
            const savedIndex = index;
            index++;
            const items = parseList(']');
            const p = peek();
            const validFollow = p === ',' || p === parentCloseChar || p === ')' || p === ']' || p === null;
            if (validFollow) {
                return {
                    __kind: 'array',
                    __type: 'Array',
                    items: items
                };
            }
            index = savedIndex;
        }

        // 5. Primitive value (String, Number, Boolean, Date, Id, null)
        return parsePrimitive(parentCloseChar);
    }

    function parseKeyValueList(closeChar) {
        const result = {};
        skipWhitespace();
        if (peek() === closeChar) {
            index++;
            return result;
        }

        while (index < len) {
            skipWhitespace();
            if (peek() === closeChar) {
                index++;
                break;
            }

            let key = '';
            while (index < len && text[index] !== '=' && text[index] !== ':' && text[index] !== closeChar && text[index] !== ',') {
                key += text[index];
                index++;
            }
            key = key.trim();

            if (index < len && (text[index] === '=' || text[index] === ':')) {
                index++; // skip '=' or ':'
                if (index < len && text[index] === '>') {
                    index++;
                }
                const val = parseValue(closeChar);
                result[key] = val;
            } else {
                if (key) result[key] = null;
            }

            skipWhitespace();
            if (peek() === ',') {
                index++;
            } else if (peek() === closeChar) {
                index++;
                break;
            } else {
                break;
            }
        }
        return result;
    }

    function parseMapOrObject(closeChar) {
        const entries = [];
        skipWhitespace();
        if (peek() === closeChar) {
            index++;
            return { __kind: 'map', __type: 'Map', entries: [] };
        }

        while (index < len) {
            skipWhitespace();
            if (peek() === closeChar) {
                index++;
                break;
            }

            const sepIdx = findTopLevelSeparator(text, index, closeChar);
            if (sepIdx !== -1) {
                let key = text.slice(index, sepIdx).trim();
                if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
                    key = key.slice(1, -1);
                }
                index = sepIdx + 1; // skip '=' or ':'
                if (index < len && text[index] === '>') {
                    index++; // skip '>' for '=>'
                }
                let val = parseValue(closeChar);
                if (val && val.__kind === 'list' && val.__type === 'List' && val.items && val.items.length === 1 && (val.items[0].__kind === 'sobject' || val.items[0].__kind === 'class')) {
                    val = val.items[0];
                }
                entries.push({ key: key, value: val });
            } else {
                if (peek() === '{' || peek() === '[' || peek() === '(') {
                    const val = parseValue(closeChar);
                    entries.push({ key: String(entries.length), value: val });
                } else {
                    let valStr = '';
                    if (peek() === '"' || peek() === "'") {
                        const quote = peek();
                        index++;
                        while (index < len && text[index] !== quote) {
                            if (text[index] === '\\' && index + 1 < len) {
                                valStr += text[index + 1];
                                index += 2;
                            } else {
                                valStr += text[index];
                                index++;
                            }
                        }
                        if (peek() === quote) index++;
                    } else {
                        while (index < len && text[index] !== ',' && text[index] !== closeChar) {
                            valStr += text[index];
                            index++;
                        }
                    }
                    entries.push({ key: valStr.trim(), value: null });
                }
            }

            skipWhitespace();
            if (peek() === ',') {
                index++;
            } else if (peek() === closeChar) {
                index++;
                break;
            } else {
                break;
            }
        }
        return {
            __kind: 'map',
            __type: 'Map',
            entries: entries
        };
    }

    function parseList(closeChar) {
        const items = [];
        skipWhitespace();
        if (peek() === closeChar) {
            index++;
            return items;
        }

        while (index < len) {
            skipWhitespace();
            if (peek() === closeChar) {
                index++;
                break;
            }

            const val = parseValue(closeChar);
            items.push(val);

            skipWhitespace();
            if (peek() === ',') {
                index++;
            } else if (peek() === closeChar) {
                index++;
                break;
            } else {
                break;
            }
        }
        return items;
    }

    function parsePrimitive(parentCloseChar) {
        skipWhitespace();
        let val = '';
        if (peek() === '"' || peek() === "'") {
            const q = peek();
            index++;
            while (index < len && text[index] !== q) {
                if (text[index] === '\\' && index + 1 < len) {
                    val += text[index + 1];
                    index += 2;
                } else {
                    val += text[index];
                    index++;
                }
            }
            if (peek() === q) index++;
            return { __kind: 'primitive', type: 'string', value: val };
        }

        let parenDepth = 0;
        let bracketDepth = 0;
        while (index < len) {
            const c = text[index];
            if (c === '(') {
                parenDepth++;
            } else if (c === ')') {
                if (parenDepth > 0) {
                    parenDepth--;
                } else if (parentCloseChar === ')' || (!parentCloseChar && c === ')')) {
                    break;
                }
            } else if (c === '[') {
                bracketDepth++;
            } else if (c === ']') {
                if (bracketDepth > 0) {
                    bracketDepth--;
                } else if (parentCloseChar === ']' || (!parentCloseChar && c === ']')) {
                    break;
                }
            } else if (parenDepth === 0 && bracketDepth === 0) {
                if (c === ',') break;
                if (parentCloseChar && c === parentCloseChar) break;
                if (!parentCloseChar && (c === '}' || c === ')' || c === ']')) break;
            }
            val += c;
            index++;
        }
        val = val.trim();

        if (val === 'null') return { __kind: 'primitive', type: 'null', value: null };
        if (val === 'true') return { __kind: 'primitive', type: 'boolean', value: true };
        if (val === 'false') return { __kind: 'primitive', type: 'boolean', value: false };
        if (/^-?\d+(\.\d+)?$/.test(val)) return { __kind: 'primitive', type: 'number', value: Number(val) };
        if (/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(val) && (val.startsWith('00') || val.startsWith('a0') || val.startsWith('01'))) {
            return { __kind: 'primitive', type: 'id', value: val };
        }
        return { __kind: 'primitive', type: 'string', value: val };
    }

    const parsed = parseValue(null);
    return {
        parsed: parsed,
        consumed: index
    };
}

/* ---------- Collection detection (strict) ---------- */

// Returns the index of the bracket that closes the one at `start`, or -1 if unbalanced / mismatched
function findBalancedEnd(str, start) {
    const closerFor = { '{': '}', '(': ')', '[': ']' };
    const stack = [];
    let inQuote = null;

    for (let k = start; k < str.length; k++) {
        const c = str[k];

        if (inQuote) {
            if (c === inQuote && !isEscaped(str, k)) {
                inQuote = null;
            }
            continue;
        }

        if (c === '"' || c === "'") {
            inQuote = c;
            continue;
        }

        if (closerFor[c]) {
            stack.push(closerFor[c]);
        } else if (c === '}' || c === ')' || c === ']') {
            if (stack.length === 0 || stack.pop() !== c) return -1;
            if (stack.length === 0) return k;
        }
    }
    return -1;
}

// A bare collection must start the value, or follow any debug prefix label
function isAnchoredStart(lead) {
    return true;
}

// ...and must be the last thing in the message (optionally followed by a |0x ref)
function isAnchoredEnd(trail) {
    return !trail.trim() || /^\s*\|0x[0-9a-fA-F]+\s*$/.test(trail);
}

// Decide whether a bare {...} / (...) / [...] is really a collection.
// Returns the (possibly converted) node, or null to treat it as plain text.
function normalizeBareCollection(node, allowLoose) {
    if (!node) return null;

    if (node.__kind === 'map') {
        const entries = node.entries || [];
        if (!entries.length) return allowLoose ? node : null;

        // Filter out truncation marker entries e.g. "..." or "(N more) ..."
        const realEntries = entries.filter(e => !(e.value === null && (e.key === '...' || e.key.startsWith('...') || /^\(\d+\s+more\)/.test(e.key))));
        const withValue = realEntries.filter(e => e.value !== null).length;

        if (withValue === realEntries.length && realEntries.length > 0) {              // {k=v, k2=v2} -> real Map
            const badKey = realEntries.some(e => !e.key || e.key.length > 120 || /[\r\n]/.test(e.key));
            return badKey ? null : node;
        }
        if (withValue === 0 && (realEntries.length >= 2 || (realEntries.length >= 1 && entries.length > realEntries.length))) {    // {a, b} -> Apex Set
            return {
                __kind: 'list', __type: 'Set',
                items: entries.map(e => ({ __kind: 'primitive', type: 'string', value: e.key }))
            };
        }
        return null;                                      // mixed/ambiguous -> plain text
    }

    if (node.__kind === 'list' || node.__kind === 'array') {
        const items = node.items || [];
        if (allowLoose) return node;                      // known value-assignment events
        if (items.length >= 2) {
            const allEmpty = items.every(it => it && it.__kind === 'primitive' && it.type === 'string' && !it.value);
            return allEmpty ? null : node;
        }
        if (items.length === 1) {
            const it = items[0];
            if (!it) return null;
            if (it.__kind !== 'primitive') return node;   // single SObject/Map/List is fine
            if (it.type === 'id') return node;            // single Id is fine
        }
        return null;                                      // "(word)", "[15]", "()" -> text
    }
    return null;
}

const SF_EVENT_LINE_REGEX = /^(?:(?:\d+\)\s*)?(?:(\d{2}:\d{2}:\d{2}(?:[.:]\d+)?(?:\s*\(\d+\))?)\s*\||\|)?)([A-Za-z0-9_]+)(?:\|(.*))?$/;

// Error Log Events and Detection
const SF_LOG_EVENT_MATCH_REGEX = /^(?:(?:(\d{2}:\d{2}:\d{2}(?:[.:]\d+)?(?:\s*\(\d+\))?)\s*\||\|)([A-Za-z0-9_]+)(?:\|(.*))?|([A-Za-z0-9_]+)\|(.*))$/;

const ERROR_EVENT_NAMES = new Set([
    'EXCEPTION_THROWN', 'FATAL_ERROR', 'VALIDATION_FAIL', 'VALIDATION_ERROR',
    'FLOW_ELEMENT_FAULT', 'FLOW_CREATE_INTERVIEW_ERROR', 'FLOW_START_INTERVIEWS_ERROR',
    'FLOW_ELEMENT_ERROR', 'INVOCABLE_ACTION_ERROR', 'WF_FLOW_ACTION_ERROR',
    'WF_FLOW_ACTION_ERROR_DETAIL', 'XDS_RESPONSE_ERROR', 'TEMPLATE_PROCESSING_ERROR',
    'NBA_STRATEGY_ERROR', 'NBA_NODE_ERROR', 'APP_ANALYTICS_ERROR', 'USER_DEBUG_ERROR'
]);

function isErrorEventName(eventName) {
    if (!eventName) return false;
    const upper = eventName.toUpperCase();
    if (ERROR_EVENT_NAMES.has(upper)) return true;
    if (upper.endsWith('_ERROR') || upper.endsWith('_FAULT')) return true;
    return false;
}

function isErrorLogLine(line, inErrorEventBlock) {
    if (!line || typeof line !== 'string') return { isError: false, isEventHeader: false, isErrorEvent: false };

    let eventName = null;
    let rest = '';

    if (line.charCodeAt(0) === 124) { // starts with '|'
        const p2 = line.indexOf('|', 1);
        if (p2 !== -1) {
            eventName = line.slice(1, p2);
            rest = line.slice(p2 + 1);
        } else {
            eventName = line.slice(1);
        }
    } else if (line.charCodeAt(2) === 58) { // starts with HH:MM:SS
        const p1 = line.indexOf('|');
        if (p1 !== -1 && p1 < 35) {
            const p2 = line.indexOf('|', p1 + 1);
            if (p2 !== -1) {
                eventName = line.slice(p1 + 1, p2);
                rest = line.slice(p2 + 1);
            } else {
                eventName = line.slice(p1 + 1);
            }
        }
    } else {
        const p1 = line.indexOf('|');
        if (p1 !== -1 && p1 < 40) {
            const candidate = line.slice(0, p1);
            if (/^[A-Za-z0-9_]+$/.test(candidate)) {
                eventName = candidate;
                rest = line.slice(p1 + 1);
            }
        }
    }

    if (eventName && /^[A-Za-z0-9_]+$/.test(eventName)) {
        const upper = eventName.toUpperCase();
        if (isErrorEventName(upper)) {
            return { isError: true, isEventHeader: true, isErrorEvent: true };
        }
        if (upper === 'USER_DEBUG') {
            if (rest.includes('|ERROR|') || rest.includes('|FATAL|') || /^(?:\[\d+\]\|)?(?:ERROR|FATAL)(?:\||$)/i.test(rest)) {
                return { isError: true, isEventHeader: true, isErrorEvent: true };
            }
        }
        if (upper === 'CALLOUT_RESPONSE') {
            if (rest.includes('StatusCode=4') || rest.includes('StatusCode=5') || rest.includes('Status=Internal Server Error')) {
                return { isError: true, isEventHeader: true, isErrorEvent: true };
            }
        }
        if (line.includes('|FATAL_ERROR|') || line.includes('|EXCEPTION_THROWN|') || line.includes('|VALIDATION_FAIL|') || line.includes('|FLOW_ELEMENT_FAULT|')) {
            return { isError: true, isEventHeader: true, isErrorEvent: true };
        }
        return { isError: false, isEventHeader: true, isErrorEvent: false };
    }

    if (inErrorEventBlock) {
        return { isError: true, isEventHeader: false, isErrorEvent: true };
    }
    if (/^(?:Class|Trigger|AnonymousBlock)\.[a-zA-Z0-9_<>]+.*:\s*line\s+\d+/i.test(line)) {
        return { isError: true, isEventHeader: false, isErrorEvent: true };
    }
    if (line.startsWith('Caused by:')) {
        return { isError: true, isEventHeader: false, isErrorEvent: true };
    }
    if (/\bSystem\.(?:[A-Za-z]+Exception|AssertionError)\b/i.test(line)) {
        return { isError: true, isEventHeader: false, isErrorEvent: true };
    }
    if (/(?:FATAL_ERROR|EXCEPTION_THROWN|VALIDATION_FAIL|FLOW_ELEMENT_FAULT)/i.test(line)) {
        return { isError: true, isEventHeader: false, isErrorEvent: true };
    }
    return { isError: false, isEventHeader: false, isErrorEvent: false };
}

function isUserDebugLogLine(line, inUserDebugBlock) {
    if (!line || typeof line !== 'string') return { isUserDebug: false, isEventHeader: false };

    let eventName = null;

    if (line.charCodeAt(0) === 124) { // starts with '|'
        const p2 = line.indexOf('|', 1);
        if (p2 !== -1) {
            eventName = line.slice(1, p2);
        } else {
            eventName = line.slice(1);
        }
    } else if (line.charCodeAt(2) === 58) { // starts with HH:MM:SS
        const p1 = line.indexOf('|');
        if (p1 !== -1 && p1 < 35) {
            const p2 = line.indexOf('|', p1 + 1);
            if (p2 !== -1) {
                eventName = line.slice(p1 + 1, p2);
            } else {
                eventName = line.slice(p1 + 1);
            }
        }
    } else {
        const p1 = line.indexOf('|');
        if (p1 !== -1 && p1 < 40) {
            const candidate = line.slice(0, p1);
            if (/^[A-Za-z0-9_]+$/.test(candidate)) {
                eventName = candidate;
            }
        }
    }

    if (eventName && /^[A-Za-z0-9_]+$/.test(eventName)) {
        const upper = eventName.toUpperCase();
        const isUD = upper === 'USER_DEBUG' || upper.startsWith('USER_DEBUG_') || upper === 'DATAWEAVE_USER_DEBUG';
        return { isUserDebug: isUD, isEventHeader: true };
    }

    return { isUserDebug: Boolean(inUserDebugBlock), isEventHeader: false };
}

function findDataStructureInLine(line) {
    if (!line) return null;

    let eventHeader = '';
    let message = line;
    let isValueAssignment = false;
    let trailingRef = '';

    // Check if line starts with a Salesforce log event
    // e.g. "03:15:14.1 (3971941)|VF_DESERIALIZE_VIEWSTATE_BEGIN|0663i000002WgGp"
    // e.g. "14:32:01.045 (45028471)|USER_DEBUG|[15]|DEBUG|Hello World"
    // e.g. "06:26:39.92 (1114414818)|FLOW_VALUE_ASSIGNMENT|722b4f2b...|fullnames|[Rose Gonzalez, ...]"
    const eventMatch = line.match(SF_EVENT_LINE_REGEX);
    if (eventMatch) {
        const eventName = eventMatch[2];
        const rest = eventMatch[3] !== undefined ? eventMatch[3] : '';

        if (eventName.startsWith('USER_DEBUG') || eventName === 'DATAWEAVE_USER_DEBUG') {
            const userDebugInner = rest.match(/^(?:\[\d+\]\|)?(?:[A-Z_]+\|)?(.*)$/s);
            if (userDebugInner) {
                const prefixLen = line.length - userDebugInner[1].length;
                eventHeader = line.slice(0, prefixLen);
                message = userDebugInner[1];
            } else {
                eventHeader = line.slice(0, line.length - rest.length);
                message = rest;
            }
        } else if (eventName === 'VARIABLE_ASSIGNMENT') {
            isValueAssignment = true;
            // Matches: [123]|varName|val or [EXTERNAL]|varName|val or varName|val
            const varInner = rest.match(/^(?:\[(?:[0-9]+|EXTERNAL)\]\|)?([^|]+)\|(.*)$/s);
            if (varInner) {
                let valPart = varInner[2];
                const refMatch = valPart.match(/^(.*?)(\|0x[0-9a-fA-F]+)$/);
                if (refMatch) {
                    valPart = refMatch[1];
                    trailingRef = refMatch[2];
                }
                const valIdx = rest.indexOf(varInner[2]);
                const prefixLen = (line.length - rest.length) + valIdx;
                eventHeader = line.slice(0, prefixLen);
                message = valPart;
            } else {
                eventHeader = line.slice(0, line.length - rest.length);
                message = rest;
            }
        } else if (eventName === 'FLOW_VALUE_ASSIGNMENT') {
            isValueAssignment = true;
            // Format: FLOW_VALUE_ASSIGNMENT|<element_or_guid>|<var_name>|<value>
            const flowValMatch = rest.match(/^([^|]+\|[^|]+)\|(.*)$/s) || rest.match(/^([^|]+)\|(.*)$/s);
            if (flowValMatch) {
                const prefixLen = line.length - flowValMatch[2].length;
                eventHeader = line.slice(0, prefixLen);
                message = flowValMatch[2];
            } else {
                eventHeader = line.slice(0, line.length - rest.length);
                message = rest;
            }
        } else if (eventName === 'FLOW_ASSIGNMENT_DETAIL') {
            isValueAssignment = true;
            // Format: FLOW_ASSIGNMENT_DETAIL|<guid>|<var_name>|<operation>|<value>
            const flowAssignMatch = rest.match(/^([^|]+\|[^|]+\|[^|]+)\|(.*)$/s);
            if (flowAssignMatch) {
                const prefixLen = line.length - flowAssignMatch[2].length;
                eventHeader = line.slice(0, prefixLen);
                message = flowAssignMatch[2];
            } else {
                eventHeader = line.slice(0, line.length - rest.length);
                message = rest;
            }
        } else if (eventName.startsWith('FLOW_')) {
            // Other Flow events may carry a collection or record in their trailing segment
            const lastPipeIdx = rest.lastIndexOf('|');
            if (lastPipeIdx !== -1) {
                const candidateVal = rest.slice(lastPipeIdx + 1).trim();
                if (candidateVal.startsWith('{') || candidateVal.startsWith('[') || candidateVal.startsWith('(')) {
                    const prefixLen = line.length - candidateVal.length;
                    eventHeader = line.slice(0, prefixLen);
                    message = candidateVal;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        } else {
            // System events (HEAP_ALLOCATE, VF_..., METHOD_..., STATEMENT_..., etc.)
            // never contain user data structures and must not be parsed as trees.
            return null;
        }
    }

    // Fast path: if message has no bracket or brace, it cannot contain a structure
    if (!message || !/[{\[(]/.test(message)) {
        return null;
    }

    // Strict scan: only accept a structure when
    //   - its brackets are balanced,
    //   - the parser consumes ALL of it,
    //   - bare collections are anchored (start of value / after ':' '=' '|' '=>' and at the end of the message),
    //   - ambiguous shapes ("(word)", "[15]", "{a, b} with null values") are rejected or converted.
    let bestCandidate = null;
    const isWord = c => /[A-Za-z0-9_]/.test(c);
    const typeRe = /[A-Za-z0-9_]+:(?=[\{\[])/y;

    for (let i = 0; i < message.length && !bestCandidate; i++) {
        const ch = message[i];
        let openIdx = -1;
        let kind = null;

        if (isWord(ch)) {
            if (i > 0 && isWord(message[i - 1])) continue;                 // only at word start
            if (i > 0 && !/[\s:=>(,{\[/|]/.test(message[i - 1])) continue;
            typeRe.lastIndex = i;
            const m = typeRe.exec(message);
            if (!m) continue;
            openIdx = i + m[0].length;                                     // index of "{" or "["
            kind = 'typed';                                                // Account:{...} / MyClass:[...]
        } else if (ch === '{' || ch === '(' || ch === '[') {
            openIdx = i;
            kind = 'bare';
        } else {
            continue;
        }

        const end = findBalancedEnd(message, openIdx);
        if (end < 0) continue;                                             // unbalanced -> not a structure

        const slice = message.slice(i, end + 1);
        const res = parseApexDebugValue(slice);
        if (!res.parsed || res.consumed !== slice.length) continue;        // parser must consume ALL of it

        const lead = message.slice(0, i);
        const trail = message.slice(end + 1);
        let node = res.parsed;

        if (kind === 'typed') {
            if (node.__kind !== 'sobject' && node.__kind !== 'class') continue;
            if (!Object.keys(node.fields || {}).length) continue;
        } else {
            const hasComplexChildren = (node.items && node.items.some(it => it && it.__kind && it.__kind !== 'primitive')) ||
                                       (node.entries && node.entries.some(e => e.value && e.value.__kind && e.value.__kind !== 'primitive'));
            if ((!isAnchoredStart(lead) && !hasComplexChildren) || !isAnchoredEnd(trail)) continue;
            node = normalizeBareCollection(node, isValueAssignment && i === 0);
            if (!node) continue;
        }

        bestCandidate = {
            eventHeader: eventHeader,
            leadText: lead,
            parsed: node,
            trailText: trail + trailingRef,
            consumed: slice.length
        };
    }

    if (bestCandidate && bestCandidate.parsed) {
        bestCandidate.parsed = resolveApexNodeTree('', bestCandidate.parsed, new Set());
    }

    return bestCandidate;
}

function apexNodeToJson(node) {
    if (!node) return null;
    if (node.__kind === 'primitive') return node.value;
    if (node.__kind === 'sobject' || node.__kind === 'class') {
        const obj = { _type: node.__type };
        for (const [k, v] of Object.entries(node.fields || {})) {
            obj[k] = apexNodeToJson(v);
        }
        return obj;
    }
    if (node.__kind === 'map') {
        const obj = {};
        for (const entry of (node.entries || [])) {
            obj[entry.key] = apexNodeToJson(entry.value);
        }
        return obj;
    }
    if (node.__kind === 'list' || node.__kind === 'array') {
        return (node.items || []).map(apexNodeToJson);
    }
    return node;
}

function getNodeSummaryPreview(node) {
    if (!node) return '';
    if (node.__kind === 'primitive') {
        if (node.type === 'string') return `"${node.value}"`;
        return String(node.value);
    }
    if (node.__kind === 'sobject' || node.__kind === 'class') {
        const fieldKeys = Object.keys(node.fields || {});
        const previewParts = [];
        for (let i = 0; i < Math.min(4, fieldKeys.length); i++) {
            const k = fieldKeys[i];
            const v = node.fields[k];
            let vStr = '';
            if (v?.__kind === 'primitive') {
                vStr = v.type === 'string' ? `"${v.value}"` : String(v.value);
            } else if (v?.__kind === 'sobject' || v?.__kind === 'class') {
                vStr = v.__type;
            } else if (v?.__kind === 'list' || v?.__kind === 'array') {
                vStr = `[${v.items?.length || 0}]`;
            } else if (v?.__kind === 'map') {
                vStr = `{...}`;
            }
            previewParts.push(`${k}: ${vStr}`);
        }
        if (fieldKeys.length > 4) previewParts.push('...');
        return `{${previewParts.join(', ')}}`;
    }
    if (node.__kind === 'map') {
        const previewParts = [];
        const entries = node.entries || [];
        for (let i = 0; i < Math.min(3, entries.length); i++) {
            const e = entries[i];
            let vStr = '';
            if (e.value?.__kind === 'primitive') {
                vStr = e.value.type === 'string' ? `"${e.value.value}"` : String(e.value.value);
            } else if (e.value?.__kind === 'map') {
                vStr = '{...}';
            } else if (e.value?.__kind === 'list' || e.value?.__kind === 'array') {
                vStr = `[${e.value.items?.length || 0}]`;
            } else if (e.value?.__type) {
                vStr = e.value.__type;
            } else {
                vStr = '...';
            }
            previewParts.push(`${e.key} => ${vStr}`);
        }
        if (entries.length > 3) previewParts.push('...');
        return `{${previewParts.join(', ')}}`;
    }
    if (node.__kind === 'list' || node.__kind === 'array') {
        const previewParts = [];
        const items = node.items || [];
        for (let i = 0; i < Math.min(3, items.length); i++) {
            const it = items[i];
            if (it?.__kind === 'primitive') {
                previewParts.push(it.type === 'string' ? `"${it.value}"` : String(it.value));
            } else if (it?.__kind === 'map') {
                previewParts.push('...');
            } else if (it?.__kind === 'sobject' || it?.__kind === 'class') {
                previewParts.push(it.__type || 'Object');
            } else if (it?.__kind === 'list' || it?.__kind === 'array') {
                previewParts.push(`[${it.items?.length || 0}]`);
            } else if (it?.__type) {
                previewParts.push(it.__type);
            } else {
                previewParts.push('...');
            }
        }
        if (items.length > 3) previewParts.push('...');
        return `[${previewParts.join(', ')}]`;
    }
    return '';
}

function renderApexNodeToHtml(node, depth, isRoot, searchLower) {
    if (depth === undefined) depth = 0;
    if (isRoot === undefined) isRoot = false;
    if (searchLower === undefined) searchLower = '';

    if (!node) return '<span class="sf_val sf_val_null">null</span>';

    if (node.__kind === 'primitive') {
        const val = node.value;
        if (node.type === 'null' || val === null || val === undefined) {
            return '<span class="sf_val sf_val_null">null</span>';
        }
        const strVal = String(val);
        const escaped = highlightText(strVal, searchLower);

        if (node.type === 'id') {
            return `<span class="sf_val sf_val_id" title="Salesforce ID">"${escaped}"</span>`;
        }
        if (node.type === 'boolean') {
            return `<span class="sf_val sf_val_bool">${escaped}</span>`;
        }
        if (node.type === 'number') {
            return `<span class="sf_val sf_val_num">${escaped}</span>`;
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(strVal)) {
            return `<span class="sf_val sf_val_date">"${escaped}"</span>`;
        }
        return `<span class="sf_val sf_val_str">"${escaped}"</span>`;
    }

    // Data structures are collapsed unless search match or expand-all
    let isExpanded = areAllNodesExpanded;
    let badgeHtml = '';
    let summaryPreview = escapeHtml(getNodeSummaryPreview(node));
    let childrenHtml = '';
    let copyJsonBtn = '';

    if (isRoot) {
        copyJsonBtn = `<button type="button" class="btn_copy_json" title="Copy object as formatted JSON"><i class="fa fa-clone"></i> Copy JSON</button>`;
    }

    if (node.__kind === 'sobject' || node.__kind === 'class') {
        const isSObj = node.__kind === 'sobject';
        const badgeClass = isSObj ? 'sf_badge_sobject' : 'sf_badge_class';
        const typeLabel = node.__type || (isSObj ? 'SObject' : 'Object');
        const fieldKeys = Object.keys(node.fields || {});
        if (!isSObj && typeLabel && !isBuiltinApexType(typeLabel)) {
            const org = orgApexClassesMap.get(typeLabel.toLowerCase());
            const id = org ? org.id : '';
            badgeHtml = `<span class="sf_badge sf_badge_class apex_class_link" data-class="${escapeHtml(typeLabel)}" data-id="${escapeHtml(id)}" title="Click to view Apex class source code">${escapeHtml(typeLabel)}</span> <span class="sf_count">(${fieldKeys.length} fields)</span>`;
        } else {
            badgeHtml = `<span class="sf_badge ${badgeClass}">${escapeHtml(typeLabel)}</span> <span class="sf_count">(${fieldKeys.length} fields)</span>`;
        }
        if (node._heapRef) {
            badgeHtml += ` <span class="sf_heap_tag" title="Resolved from memory address ${escapeHtml(node._heapRef)}">${escapeHtml(node._heapRef)}</span>`;
        }

        const childRows = [];
        for (const [key, val] of Object.entries(node.fields || {})) {
            const keyHtml = highlightText(key, searchLower);
            const isValComplex = val && val.__kind && val.__kind !== 'primitive';
            const valComplexClass = isValComplex ? ' sf_row_complex' : '';
            childRows.push(`
                <div class="sf_tree_row${valComplexClass}">
                    <span class="sf_key">${keyHtml}</span><span class="sf_sep">:</span>
                    <div class="sf_val_wrap">${renderApexNodeToHtml(val, depth + 1, false, searchLower)}</div>
                </div>
            `);
        }
        childrenHtml = childRows.join('');
    } else if (node.__kind === 'map') {
        const entries = node.entries || [];
        const count = node.sizeHint || entries.length;
        badgeHtml = `<span class="sf_badge sf_badge_map">Map</span> <span class="sf_count">(${count} entries)</span>`;
        if (node._heapRef) {
            badgeHtml += ` <span class="sf_heap_tag" title="Resolved from memory address ${escapeHtml(node._heapRef)}">${escapeHtml(node._heapRef)}</span>`;
        }

        const childRows = [];
        entries.forEach(e => {
            if (e.key === '...' && e.value === null) {
                childRows.push(`
                    <div class="sf_tree_row sf_row_ellipsis" style="padding: 2px 0 2px 20px;">
                        <span class="sf_key" style="opacity: 0.65; font-style: italic;">... (truncated by Salesforce log limits)</span>
                    </div>
                `);
                return;
            }
            const keyHtml = highlightText(e.key, searchLower);
            const isValComplex = e.value && e.value.__kind && e.value.__kind !== 'primitive';
            const valComplexClass = isValComplex ? ' sf_row_complex' : '';
            childRows.push(`
                <div class="sf_tree_row${valComplexClass}">
                    <span class="sf_key sf_map_key">${keyHtml}</span><span class="sf_sep">=></span>
                    <div class="sf_val_wrap">${renderApexNodeToHtml(e.value, depth + 1, false, searchLower)}</div>
                </div>
            `);
        });
        childrenHtml = childRows.join('');
    } else if (node.__kind === 'list' || node.__kind === 'array') {
        const isList = node.__kind === 'list';
        const badgeClass = isList ? 'sf_badge_list' : 'sf_badge_array';
        const label = node.__type === 'Set' ? 'Set' : (isList ? 'List' : 'Array');
        const items = node.items || [];
        const count = node.sizeHint || items.length;
        badgeHtml = `<span class="sf_badge ${badgeClass}">${label}</span> <span class="sf_count">(${count} items)</span>`;
        if (node._heapRef) {
            badgeHtml += ` <span class="sf_heap_tag" title="Resolved from memory address ${escapeHtml(node._heapRef)}">${escapeHtml(node._heapRef)}</span>`;
        }

        const childRows = [];
        items.forEach((item, idx) => {
            if (item && item.__kind === 'primitive' && item.value === '...') {
                childRows.push(`
                    <div class="sf_tree_row sf_row_ellipsis" style="padding: 2px 0 2px 20px;">
                        <span class="sf_key" style="opacity: 0.65; font-style: italic;">... (truncated by Salesforce log limits)</span>
                    </div>
                `);
                return;
            }
            const isValComplex = item && item.__kind && item.__kind !== 'primitive';
            const valComplexClass = isValComplex ? ' sf_row_complex' : '';
            childRows.push(`
                <div class="sf_tree_row${valComplexClass}">
                    <span class="sf_key sf_index">${idx}</span><span class="sf_sep">:</span>
                    <div class="sf_val_wrap">${renderApexNodeToHtml(item, depth + 1, false, searchLower)}</div>
                </div>
            `);
        });
        childrenHtml = childRows.join('');
    }

    // Auto-expand nodes that contain a search match (in a key or in any nested value)
    if (searchLower && childrenHtml.indexOf('log_highlight') !== -1) {
        isExpanded = true;
    }

    const expandClass = isExpanded ? 'is-expanded' : '';
    const caretClass = isExpanded ? 'is-open' : '';
    const childrenStyle = isExpanded ? '' : 'style="display:none;"';

    return `
        <div class="sf_tree_node ${expandClass}" data-depth="${depth}">
            <div class="sf_tree_header">
                <i class="fa fa-caret-right sf_caret ${caretClass}"></i>
                ${badgeHtml}
                <span class="sf_tree_preview">${summaryPreview}</span>
                ${copyJsonBtn}
            </div>
            <div class="sf_tree_children" ${childrenStyle}>
                ${childrenHtml}
            </div>
        </div>
    `;
}

let currentErrorJumpIndex = -1;
let currentRenderToken = 0;
let pendingRenderFlush = null;
const parsedStructuresByLineNum = new Map();
let currentErrorLineIndices = [];

function setViewerEmptyState(message) {
    $('.viewer_error_jump_btn').addClass('hide');
    currentErrorJumpIndex = -1;
    currentErrorLineIndices = [];
    pendingRenderFlush = null;
    parsedStructuresByLineNum.clear();

    const useVirtualizer = Boolean(window.ApexLogVirtualizer && window.ApexLogVirtualizer.isAvailable);
    const $container = $('.d_down_viewer_content');

    if (useVirtualizer) {
        $container.addClass('has-virtualizer');
        const containerEl = $container[0];
        if (!window.ApexLogVirtualizer.isMounted()) {
            window.ApexLogVirtualizer.mount(containerEl, {
                lines: [],
                textSearch: '',
                emptyMessage: message
            });
        } else {
            window.ApexLogVirtualizer.update({
                lines: [],
                textSearch: '',
                emptyMessage: message
            });
        }
    } else {
        $container.removeClass('has-virtualizer').html(`<div class="viewer_empty_state">${message}</div>`);
    }
}

function renderFormattedLog(lines, textSearch) {
    const $container = $('.d_down_viewer_content');
    const useVirtualizer = Boolean(window.ApexLogVirtualizer && window.ApexLogVirtualizer.isAvailable);

    if (!lines || lines.length === 0) {
        currentErrorJumpIndex = -1;
        currentErrorLineIndices = [];
        $('.viewer_error_jump_btn').addClass('hide');
        pendingRenderFlush = null;
        parsedStructuresByLineNum.clear();

        if (useVirtualizer) {
            $container.addClass('has-virtualizer');
            const containerEl = $container[0];
            const emptyProps = {
                lines: [],
                textSearch: textSearch || '',
                emptyMessage: 'No matching log lines for current filter selection.'
            };
            if (!window.ApexLogVirtualizer.isMounted()) {
                window.ApexLogVirtualizer.mount(containerEl, emptyProps);
            } else {
                window.ApexLogVirtualizer.update(emptyProps);
            }
            return;
        }

        if (textSearch) {
            $container.removeClass('has-virtualizer').html(`
                <div class="viewer_empty_state" style="padding:40px 20px;text-align:center;">
                    <i class="fa fa-search" style="font-size:32px;margin-bottom:12px;color:#94a3b8;display:block;"></i>
                    <div style="font-size:15px;font-weight:600;margin-bottom:6px;">No lines matching "<strong>${escapeHtml(textSearch)}</strong>" in this log</div>
                    <div style="font-size:12px;color:#64748b;margin-bottom:16px;">Click any of the red-highlighted logs in the right table to view its matches, or clear the search filter.</div>
                    <button type="button" class="btn_viewer_clear_search" style="background:#0284c7;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;">Clear Search</button>
                </div>
            `);
        } else {
            $container.removeClass('has-virtualizer').html('<div class="viewer_empty_state">No matching log lines for current filter selection.</div>');
        }
        return;
    }

    currentErrorJumpIndex = -1;
    currentErrorLineIndices = [];
    parsedStructuresByLineNum.clear();
    const renderToken = ++currentRenderToken;
    const searchLower = textSearch ? textSearch.toLowerCase().trim() : '';

    // Pre-classify error lines and user debug lines across all lines in current filtered log
    const lineErrorMap = new Array(lines.length);
    const lineUserDebugMap = new Array(lines.length);
    let inErrorBlock = false;
    let inUserDebugBlock = false;
    let totalErrorLinesCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const res = isErrorLogLine(lines[i], inErrorBlock);
        if (res.isEventHeader) {
            inErrorBlock = res.isErrorEvent;
        }
        lineErrorMap[i] = res.isError;
        if (res.isError) {
            totalErrorLinesCount++;
            currentErrorLineIndices.push(i);
        }

        const udRes = isUserDebugLogLine(lines[i], inUserDebugBlock);
        if (udRes.isEventHeader) {
            inUserDebugBlock = udRes.isUserDebug;
        }
        lineUserDebugMap[i] = udRes.isUserDebug;
    }

    // Update error jump button in toolbar
    const $errorJumpBtn = $('.viewer_error_jump_btn');
    if ($errorJumpBtn.length) {
        if (totalErrorLinesCount > 0) {
            $errorJumpBtn.removeClass('hide').attr('title', `Found ${totalErrorLinesCount.toLocaleString()} error line${totalErrorLinesCount > 1 ? 's' : ''}. Click to jump through errors.`);
            $errorJumpBtn.find('.error_jump_text').text(`${totalErrorLinesCount.toLocaleString()} Error${totalErrorLinesCount > 1 ? 's' : ''}`);
        } else {
            $errorJumpBtn.addClass('hide');
        }
    }

    function formatLineContent(line, idx, isError, isUserDebug, search) {
        const lineNum = idx + 1;
        if (!line) {
            return {
                html: `<span class="log_line_num">${lineNum}</span><span class="log_row_content"> </span>`,
                isTree: false
            };
        }

        // Fast check: Only inspect data structures if the line contains actual event markers
        let structInfo = null;
        if (line.includes('|VARIABLE_ASSIGNMENT|') || line.includes('|USER_DEBUG|') || line.includes('|FLOW_') || line.includes('DATAWEAVE_USER_DEBUG') || line.includes('=>')) {
            structInfo = findDataStructureInLine(line);
        }

        if (structInfo && structInfo.parsed) {
            parsedStructuresByLineNum.set(lineNum, structInfo.parsed);
            let headerHtml = '';
            if (structInfo.eventHeader) {
                const pipeIdx = structInfo.eventHeader.indexOf('|');
                const isUserDebugEvt = structInfo.eventHeader.includes('USER_DEBUG');
                const isFlow = structInfo.eventHeader.includes('FLOW_');
                const isVar = structInfo.eventHeader.includes('VARIABLE_ASSIGNMENT');
                const isErrEvt = isError || isErrorEventName(structInfo.eventHeader);
                const prefixClass = isErrEvt ? 'event_error' : (isUserDebugEvt ? 'event_user_debug' : (isFlow ? 'event_flow' : (isVar ? 'event_variable' : '')));
                if (pipeIdx > 7 && pipeIdx < 35 && structInfo.eventHeader.charCodeAt(2) === 58) {
                    const timePart = structInfo.eventHeader.slice(0, pipeIdx + 1);
                    const restPart = structInfo.eventHeader.slice(pipeIdx + 1);
                    headerHtml = `<span class="log_timestamp">${escapeHtml(timePart)}</span><span class="log_event_prefix ${prefixClass}">${formatApexLogLine(restPart, searchLower)}</span>`;
                } else {
                    headerHtml = `<span class="log_event_prefix ${prefixClass}">${formatApexLogLine(structInfo.eventHeader, searchLower)}</span>`;
                }
            }
            const leadHtml = structInfo.leadText ? `<span class="log_lead_text">${formatApexLogLine(structInfo.leadText, searchLower)}</span>` : '';
            const trailHtml = structInfo.trailText ? `<span class="log_trail_text">${formatApexLogLine(structInfo.trailText, searchLower)}</span>` : '';
            const treeHtml = renderApexNodeToHtml(structInfo.parsed, 0, areAllNodesExpanded, searchLower);

            return {
                html: `
                    <span class="log_line_num">${lineNum}</span>
                    <div class="log_row_content">
                        ${headerHtml}${leadHtml}
                        <div class="sf_tree_root">${treeHtml}</div>
                        ${trailHtml}
                    </div>
                `,
                isTree: true
            };
        }

        // Plain log line (Fast path: string slicing instead of full regex on every line)
        let contentHtml = '';
        const pipeIdx = line.indexOf('|');
        if (pipeIdx > 7 && pipeIdx < 35 && line.charCodeAt(2) === 58) {
            const timePart = line.slice(0, pipeIdx + 1);
            const restPart = line.slice(pipeIdx + 1);
            contentHtml = `<span class="log_timestamp">${escapeHtml(timePart)}</span>${formatApexLogLine(restPart, searchLower)}`;
        } else {
            contentHtml = formatApexLogLine(line, searchLower);
        }
        return {
            html: `
                <span class="log_line_num">${lineNum}</span>
                <span class="log_row_content log_plain_text">${contentHtml}</span>
            `,
            isTree: false
        };
    }

    // Option B: Full React + TanStack Virtual Architecture
    if (useVirtualizer) {
        $container.addClass('has-virtualizer');
        const containerEl = $container[0];
        const viewerProps = {
            lines: lines,
            textSearch: textSearch || '',
            lineErrorMap: lineErrorMap,
            lineUserDebugMap: lineUserDebugMap,
            formatLine: formatLineContent
        };

        if (!window.ApexLogVirtualizer.isMounted()) {
            window.ApexLogVirtualizer.mount(containerEl, viewerProps);
        } else {
            window.ApexLogVirtualizer.update(viewerProps);
        }
        pendingRenderFlush = null;
        return;
    }

    // Fallback: Non-virtual chunked renderer
    $container.removeClass('has-virtualizer');
    function buildRowHtml(line, lineNum, isError, isUserDebug) {
        const rowRes = formatLineContent(line, lineNum - 1, isError, isUserDebug, searchLower);
        const errorClass = isError ? ' log_row_error' : '';
        const userDebugClass = isUserDebug ? ' log_row_user_debug' : '';
        const treeClass = rowRes.isTree ? ' row_has_tree' : '';
        return `<div class="log_row${treeClass}${errorClass}${userDebugClass}" data-line-num="${lineNum}">${rowRes.html}</div>`;
    }

    // 1. Initial fast slice (2,000 lines) renders immediately in < 25ms for instant UI responsiveness
    const initialBatchSize = Math.min(2000, lines.length);
    let initialHtml = '';
    for (let i = 0; i < initialBatchSize; i++) {
        initialHtml += buildRowHtml(lines[i], i + 1, lineErrorMap[i], lineUserDebugMap[i]);
    }
    $container.html(initialHtml);

    // If all lines already rendered, we are done
    if (initialBatchSize >= lines.length) {
        pendingRenderFlush = null;
        return;
    }

    // 2. Progressive non-blocking background streaming for remaining lines (e.g. 4,000 lines per animation frame)
    let currentRenderIndex = initialBatchSize;
    const chunkSize = 4000;

    function renderNextSlice() {
        if (currentRenderToken !== renderToken) return; // aborted because user selected another log
        if (currentRenderIndex >= lines.length) {
            pendingRenderFlush = null;
            return;
        }

        const nextIndex = Math.min(currentRenderIndex + chunkSize, lines.length);
        let sliceHtml = '';
        for (let i = currentRenderIndex; i < nextIndex; i++) {
            sliceHtml += buildRowHtml(lines[i], i + 1, lineErrorMap[i], lineUserDebugMap[i]);
        }
        $container.append(sliceHtml);
        currentRenderIndex = nextIndex;

        if (currentRenderIndex < lines.length) {
            if (typeof requestAnimationFrame !== 'undefined') {
                requestAnimationFrame(renderNextSlice);
            } else {
                setTimeout(renderNextSlice, 0);
            }
        } else {
            pendingRenderFlush = null;
        }
    }

    // Synchronous flush function: Immediately appends all remaining lines if Windows standard Ctrl+F is pressed
    pendingRenderFlush = function () {
        if (currentRenderToken !== renderToken || currentRenderIndex >= lines.length) return;
        let remainingHtml = '';
        for (let i = currentRenderIndex; i < lines.length; i++) {
            remainingHtml += buildRowHtml(lines[i], i + 1, lineErrorMap[i], lineUserDebugMap[i]);
        }
        $container.append(remainingHtml);
        currentRenderIndex = lines.length;
        pendingRenderFlush = null;
    };

    if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(renderNextSlice);
    } else {
        setTimeout(renderNextSlice, 0);
    }
}

function parseAndFilterLog(rawLog, selectedEvents, textSearchTerm) {
    if (!rawLog) {
        return {
            filteredText: '',
            filteredLines: [],
            totalEvents: 0,
            matchedEvents: 0,
            totalLines: 0,
            matchedLines: 0
        };
    }

    const lines = rawLog.split(/\r?\n/);
    const totalLines = lines.length;

    if (!selectedEvents || selectedEvents.size === 0) {
        return {
            filteredText: '// No events selected. Check one or more event filters or select a preset to view logs.\n',
            filteredLines: ['// No events selected. Check one or more event filters or select a preset to view logs.'],
            totalEvents: 0,
            matchedEvents: 0,
            totalLines: totalLines,
            matchedLines: 0
        };
    }

    const searchLower = textSearchTerm ? textSearchTerm.toLowerCase().trim() : null;

    // "All selected" must compare actual contents, not just sizes (the stored selection can hold stale events)
    let allKnownSelected = ALL_EVENTS_SET.size > 0;
    if (allKnownSelected) {
        for (const ev of ALL_EVENTS_SET) {
            if (!selectedEvents.has(ev)) { allKnownSelected = false; break; }
        }
    }
    if (allKnownSelected && !searchLower) {
        return {
            filteredText: rawLog,
            filteredLines: lines,
            totalEvents: totalLines,
            matchedEvents: totalLines,
            totalLines: totalLines,
            matchedLines: totalLines
        };
    }

    // Standard Salesforce debug event regex:
    // e.g. "14:32:01.045 (45028471)|USER_DEBUG|[15]|DEBUG|Hello World"
    const eventRegex = /^(?:\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s*\(\d+\))?\||\|)([A-Za-z0-9_]+)(?:\|(.*))?$/;

    let filteredLines = [];
    let isCurrentEventIncluded = false;
    let totalEventsCount = 0;
    let matchedEventsCount = 0;
    let currentBlock = [];
    const initialHeaderLines = [];

    function flushBlock() {
        if (currentBlock.length === 0) return;
        if (!searchLower || currentBlock.some(l => l.toLowerCase().includes(searchLower))) {
            for (let j = 0; j < currentBlock.length; j++) {
                filteredLines.push(currentBlock[j]);
            }
        }
        currentBlock = [];
    }

    let inInitialHeader = true;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(eventRegex);

        if (match) {
            inInitialHeader = false;
            totalEventsCount++;
            flushBlock();

            const eventNameUpper = match[1].toUpperCase();
            const isCategorySelected = selectedEvents.has(eventNameUpper);
            const lineMatchesSearch = Boolean(searchLower && line.toLowerCase().includes(searchLower));

            // CRITICAL FIX: If user is searching by text, any event whose line contains the search term
            // MUST be included, even if its category checkbox is unchecked!
            if (isCategorySelected || lineMatchesSearch) {
                isCurrentEventIncluded = true;
                matchedEventsCount++;
                currentBlock.push(line);
            } else {
                isCurrentEventIncluded = false;
            }
        } else {
            if (inInitialHeader) {
                initialHeaderLines.push(line);
            } else {
                const lineMatchesSearch = Boolean(searchLower && line.toLowerCase().includes(searchLower));
                // CRITICAL FIX: If a continuation line contains the searched text, ensure it is included!
                if (isCurrentEventIncluded || lineMatchesSearch) {
                    if (!isCurrentEventIncluded && lineMatchesSearch) {
                        isCurrentEventIncluded = true;
                        matchedEventsCount++;
                    }
                    currentBlock.push(line);
                }
            }
        }
    }
    flushBlock();

    // CRITICAL FIX: Header lines handling
    // When no search filter is active, include initial header lines (e.g. "61.0 APEX_CODE,FINEST;...")
    // When a search filter is active:
    // - If the header itself matches searchLower, include it
    // - If matching lines were found in the log, include the first header line for log context
    // - If NO lines in the log matched searchLower, leave filteredLines empty so it properly reports 0 matches!
    if (!searchLower) {
        filteredLines = initialHeaderLines.concat(filteredLines);
    } else {
        const headerMatches = initialHeaderLines.filter(l => l.toLowerCase().includes(searchLower));
        if (headerMatches.length > 0) {
            filteredLines = headerMatches.concat(filteredLines);
        } else if (filteredLines.length > 0 && initialHeaderLines.length > 0) {
            filteredLines = [initialHeaderLines[0]].concat(filteredLines);
        }
    }

    let cachedFilteredText = null;
    return {
        get filteredText() {
            if (cachedFilteredText === null) {
                cachedFilteredText = filteredLines.join('\n');
            }
            return cachedFilteredText;
        },
        filteredLines: filteredLines,
        totalEvents: totalEventsCount,
        matchedEvents: matchedEventsCount,
        totalLines: totalLines,
        matchedLines: filteredLines.length
    };
}

let lastIndexedCurrentLogId = null;
const indexedSessionLogIds = new Set();
let lastFilteredResult = null;

function syncRawTextarea() {
    if (!lastFilteredResult) return;
    let textForArea = lastFilteredResult.filteredText || '';
    if ($('#toggleTimestampCb').length && !$('#toggleTimestampCb').is(':checked')) {
        textForArea = textForArea.replace(/^(\d{2}:\d{2}:\d{2}(?:[.:]\d+)?(?:\s*\(\d+\))?\s*\|)/gm, '');
    }
    $('.d_down_textarea').val(textForArea);
}

function applyFilters() {
    if (!rawLogData) {
        $('.filter_stats_badge').text('No log selected').attr('title', 'No log selected');
        setViewerEmptyState('Select a log from the table on the right to view and filter events...');
        $('.d_down_textarea').val('');
        lastFilteredResult = null;
        return;
    }

    if (lastScannedLogId !== currentLogId) {
        scanLogForApexClasses(rawLogData);
        lastScannedLogId = currentLogId;
    }

    // Incrementally index session logs that haven't been indexed yet
    if (typeof sessionLogsCache !== 'undefined' && sessionLogsCache && sessionLogsCache.size > 0) {
        for (const [id, entry] of sessionLogsCache.entries()) {
            if (entry && entry.body && !indexedSessionLogIds.has(id)) {
                indexHeapAssignments(entry.body, false);
                indexedSessionLogIds.add(id);
            }
        }
    }

    // Only re-index active log if log ID changed
    if (lastIndexedCurrentLogId !== currentLogId) {
        indexHeapAssignments(rawLogData, true);
        enrichPlanMaps(sessionHeapFieldMap, currentLogHeapFieldMap);
        lastIndexedCurrentLogId = currentLogId;
    }

    const textSearch = $('.viewer_text_search_inp').val();
    const result = parseAndFilterLog(rawLogData, selectedEventsSet, textSearch);
    lastFilteredResult = result;

    if (!$('.d_down_textarea').hasClass('hide')) {
        syncRawTextarea();
    }
    renderFormattedLog(result.filteredLines, textSearch);

    let pct = result.totalLines > 0 ? ((result.matchedLines / result.totalLines) * 100).toFixed(1) : 0;
    let statsText = `Showing ${result.matchedLines.toLocaleString()} / ${result.totalLines.toLocaleString()} lines (${pct}%) * ${result.matchedEvents.toLocaleString()} events`;
    if (textSearch) {
        statsText += ` * Filtered by "${textSearch}"`;
    }
    $('.filter_stats_badge').text(statsText).attr('title', statsText);
}


/* ========================================================
   USER CUSTOM EVENTS PRESET PERSISTENCE
   ======================================================== */

function saveCustomPresetEvents(eventsSet) {
    try {
        const arr = Array.from(eventsSet);
        localStorage.setItem('sfqa_debug_custom_events_preset', JSON.stringify(arr));
    } catch (e) {
        console.warn('Error saving custom preset:', e);
    }
}

function saveActivePreset(presetName) {
    try {
        if (presetName) {
            localStorage.setItem('sfqa_debug_active_preset', presetName);
        } else {
            localStorage.removeItem('sfqa_debug_active_preset');
        }
    } catch (e) { }
}

function loadActivePreset() {
    try {
        return localStorage.getItem('sfqa_debug_active_preset');
    } catch (e) {
        return null;
    }
}

function loadCustomPresetEvents() {
    try {
        const stored = localStorage.getItem('sfqa_debug_custom_events_preset');
        if (stored) {
            const arr = JSON.parse(stored);
            return new Set(arr.map(e => String(e).toUpperCase()));
        }
    } catch (e) {
        console.warn('Error loading custom preset:', e);
    }
    return null;
}

function applyPreset(presetName) {
    $('.filter_preset_chip').removeClass('active');
    $(`.filter_preset_chip[data-preset="${presetName}"]`).addClass('active');
    saveActivePreset(presetName);

    let newSelected = new Set();

    switch (presetName) {
        case 'USER_DEBUG':
            [
                'USER_DEBUG', 'USER_DEBUG_FINEST', 'USER_DEBUG_FINER', 'USER_DEBUG_FINE',
                'USER_DEBUG_INFO', 'USER_DEBUG_WARN', 'USER_DEBUG_ERROR', 'DATAWEAVE_USER_DEBUG'
            ].forEach(e => newSelected.add(e));
            break;
        case 'ERRORS':
            [
                'EXCEPTION_THROWN', 'FATAL_ERROR', 'VALIDATION_FAIL', 'VALIDATION_ERROR',
                'WF_FLOW_ACTION_ERROR', 'WF_FLOW_ACTION_ERROR_DETAIL', 'FLOW_CREATE_INTERVIEW_ERROR',
                'FLOW_START_INTERVIEWS_ERROR', 'FLOW_ELEMENT_ERROR', 'INVOCABLE_ACTION_ERROR',
                'XDS_RESPONSE_ERROR', 'TEMPLATE_PROCESSING_ERROR', 'NBA_STRATEGY_ERROR',
                'NBA_NODE_ERROR', 'APP_ANALYTICS_ERROR'
            ].forEach(e => newSelected.add(e));
            break;
        case 'DATABASE': {
            const dbCat = DEBUG_CATEGORIES.find(c => c.name === 'Database');
            if (dbCat) dbCat.events.forEach(e => newSelected.add(e.toUpperCase()));
            break;
        }
        case 'CALLOUTS': {
            const callCat = DEBUG_CATEGORIES.find(c => c.name === 'Callouts');
            if (callCat) callCat.events.forEach(e => newSelected.add(e.toUpperCase()));
            break;
        }
        case 'WORKFLOW': {
            const wfCat = DEBUG_CATEGORIES.find(c => c.name === 'Workflow');
            if (wfCat) wfCat.events.forEach(e => newSelected.add(e.toUpperCase()));
            break;
        }
        case 'CUSTOM': {
            const customSaved = loadCustomPresetEvents();
            if (customSaved && customSaved.size > 0) {
                customSaved.forEach(e => newSelected.add(e));
            } else {
                // If nothing saved yet, take current selection as initial custom set
                selectedEventsSet.forEach(e => newSelected.add(e));
                saveCustomPresetEvents(newSelected);
            }
            break;
        }
        case 'APEX': {
            const apexCat = DEBUG_CATEGORIES.find(c => c.name === 'Apex Code');
            if (apexCat) apexCat.events.forEach(e => newSelected.add(e.toUpperCase()));
            break;
        }
        case 'ALL':
            ALL_EVENTS_LIST.forEach(e => newSelected.add(e.toUpperCase()));
            break;
        case 'CLEAR':
            break;
    }

    selectedEventsSet = newSelected;
    saveSelectedEvents();
    syncCheckboxesUI();
    applyFilters();

    $('.snackbar').text(`Filter preset: ${presetName} applied.`);
    showToast();
}

// Category accordion header click
$(document).on('click', '.cat_card_header', function (e) {
    if ($(e.target).hasClass('cat_checkbox') || $(e.target).closest('.btn_sort_cat').length > 0) {
        return;
    }
    $(this).closest('.cat_card').toggleClass('open');
});

// Sort button click (A -> Z)
$(document).on('click', '.btn_sort_cat', function (e) {
    e.stopPropagation();
    var catName = $(this).attr('data-cat');
    sortCategoryAlphabetically(catName);
    var $btn = $(this);
    $btn.addClass('sort_active');
    setTimeout(function() { $btn.removeClass('sort_active'); }, 400);
});
// Category select-all checkbox change
$(document).on('change', '.cat_checkbox', function () {
    const catName = $(this).attr('data-cat');
    const isChecked = $(this).is(':checked');
    const cat = DEBUG_CATEGORIES.find(c => c.name === catName);
    if (!cat) return;

    cat.events.forEach(ev => {
        const evUpper = ev.toUpperCase();
        if (isChecked) {
            selectedEventsSet.add(evUpper);
        } else {
            selectedEventsSet.delete(evUpper);
        }
    });

    const isCustomActive = $('.filter_preset_chip[data-preset="CUSTOM"]').hasClass('active');
    if (isCustomActive) {
        saveCustomPresetEvents(selectedEventsSet);
    } else {
        $('.filter_preset_chip').removeClass('active');
        saveActivePreset(null);
    }
    saveSelectedEvents();
    syncCheckboxesUI();
    applyFilters();
});

// Individual event checkbox change
$(document).on('change', '.event_checkbox', function () {
    const ev = $(this).val().toUpperCase();
    if ($(this).is(':checked')) {
        selectedEventsSet.add(ev);
    } else {
        selectedEventsSet.delete(ev);
    }

    const isCustomActive = $('.filter_preset_chip[data-preset="CUSTOM"]').hasClass('active');
    if (isCustomActive) {
        saveCustomPresetEvents(selectedEventsSet);
    } else {
        $('.filter_preset_chip').removeClass('active');
        saveActivePreset(null);
    }
    saveSelectedEvents();
    syncCheckboxesUI();
    applyFilters();
});

// Select All / Clear All buttons
$(document).on('click', '.btn_select_all', function () {
    applyPreset('ALL');
});

$(document).on('click', '.btn_clear_all', function () {
    applyPreset('CLEAR');
});

// Presets click
$(document).on('click', '.filter_preset_chip', function () {
    const preset = $(this).attr('data-preset');
    applyPreset(preset);
});

// Filter search input
$(document).on('input', '.filter_search_inp', function () {
    const query = $(this).val().toLowerCase().trim();
    if (query) {
        $('.filter_search_clear').removeClass('hide');
    } else {
        $('.filter_search_clear').addClass('hide');
    }

    $('.cat_card').each(function () {
        const catCard = $(this);
        let matchCount = 0;

        catCard.find('.event_item').each(function () {
            const evName = $(this).attr('data-event').toLowerCase();
            if (!query || evName.includes(query)) {
                $(this).show();
                matchCount++;
            } else {
                $(this).hide();
            }
        });

        if (matchCount > 0 || !query) {
            catCard.show();
            if (query) {
                catCard.addClass('open');
            }
        } else {
            catCard.hide();
        }
    });
});

$(document).on('click', '.filter_search_clear', function () {
    $('.filter_search_inp').val('').trigger('input');
});

// In-log text search
$(document).on('input', '.viewer_text_search_inp', function () {
    const val = $(this).val();
    if (val) {
        $('.viewer_text_search_clear').removeClass('hide');
    } else {
        $('.viewer_text_search_clear').addClass('hide');
    }
    applyFilters();
});

$(document).on('click', '.viewer_text_search_clear, .btn_viewer_clear_search', function () {
    $('.viewer_text_search_inp').val('');
    $('.viewer_text_search_clear').addClass('hide');
    applyFilters();
});

// Toggle Filter Panel
$(document).on('click', '.top_filter_btn, .floating_filters_tab, .btn_collapse_filters', function () {
    $('.down_c').toggleClass('filters-collapsed');
    const isCollapsed = $('.down_c').hasClass('filters-collapsed');
    $('.top_filter_btn').toggleClass('is-active', !isCollapsed);
    try {
        localStorage.setItem('sfqa_debug_filters_collapsed', isCollapsed ? '1' : '0');
    } catch (e) { }
});

// Click icon handlers to trigger search / user lookups
$(document).on('click', '.top_search_btn', function () {
    const e = $.Event('keydown', { which: 13, keyCode: 13 });
    $('.top_debugsearch_inp').trigger(e);
});

$(document).on('click', '.top_user_icon', function () {
    const e = $.Event('keydown', { which: 13, keyCode: 13 });
    $('.top_userinfo_inp').trigger(e);
});

// Toggle Logs List Table Panel
$(document).on('click', '.btn_collapse_logs, .floating_logs_tab', function () {
    $('.down_c').toggleClass('logs-collapsed');
    const isCollapsed = $('.down_c').hasClass('logs-collapsed');
    try {
        localStorage.setItem('sfqa_debug_logs_collapsed', isCollapsed ? '1' : '0');
    } catch (e) { }
});

// Helper to construct exact Apex log filename matching table sequence & zip format
function buildApexLogFileName(meta, logId, dateColText, index, total) {
    meta = meta || {};
    const rawOp = meta.Operation || 'ApexLog';
    const cleanOp = rawOp.replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, '_').trim() || 'Log';
    const rawStatus = meta.Status || '';
    const status = String(rawStatus).replace(/[/\\?%*:|"<>]/g, '').trim();

    let cleanDateText = dateColText;
    if (!cleanDateText && meta.LastModifiedDate) {
        try {
            cleanDateText = Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(meta.LastModifiedDate));
        } catch (e) {
            cleanDateText = '';
        }
    }
    const cleanTime = (cleanDateText || '').replace(/:/g, '-').replace(/[/\\?%*:|"<>]/g, '_').trim();
    const padLen = String(total).length > 2 ? 3 : 2;
    const indexPrefix = String(index).padStart(padLen, '0');

    let fileName = `${indexPrefix}_${cleanOp}`;
    if (status) fileName += `_${status}`;
    if (logId) fileName += `_${logId}`;
    if (cleanTime) fileName += `_${cleanTime}`;
    fileName += '.log';
    return fileName;
}

// Copy Filtered Log
$(document).on('click', '.copy_log_btn', function () {
    if (!currentLogId || !rawLogData || !rawLogData.trim() || sessionLogsCache.size === 0 || !sessionLogsCache.has(currentLogId)) {
        $('.snackbar').text('No log is currently opened in the viewer to copy.');
        showToast();
        return;
    }
    syncRawTextarea();
    const text = $('.d_down_textarea').val();
    if (!text || !text.trim() || text.startsWith('// No events selected') || text.startsWith('// Logs cleared') || text.startsWith('// Select a log')) {
        $('.snackbar').text('No matching log events to copy with current filters.');
        showToast();
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        $('.snackbar').text('Filtered log copied to clipboard!');
        showToast();
    }).catch(err => {
        console.error('Failed to copy', err);
    });
});

// Download Filtered Log
$(document).on('click', '.download_log_btn', function () {
    if (!currentLogId || !rawLogData || !rawLogData.trim() || sessionLogsCache.size === 0 || !sessionLogsCache.has(currentLogId)) {
        $('.snackbar').text('No log is currently opened in the viewer to download.');
        showToast();
        return;
    }

    syncRawTextarea();
    const text = $('.d_down_textarea').val();
    if (!text || !text.trim() || text.startsWith('// No events selected') || text.startsWith('// Logs cleared') || text.startsWith('// Select a log')) {
        $('.snackbar').text('No matching log events to download with current filters.');
        showToast();
        return;
    }

    const allRows = $('.log_table_body tr.tr[data-id]');
    const $currentRow = $(`.log_table_body tr.tr[data-id="${currentLogId}"]`);
    let total = allRows.length || sessionLogsCache.size || 1;
    let rowIndex = 1;

    if ($currentRow.length > 0) {
        rowIndex = allRows.index($currentRow) + 1;
    } else {
        const ids = Array.from(sessionLogsCache.keys());
        const idx = ids.indexOf(currentLogId);
        if (idx !== -1) rowIndex = idx + 1;
    }

    const cached = sessionLogsCache.get(currentLogId) || {};
    const meta = cached.metadata || {};
    let dateColText = $currentRow.find('.td_date').text()?.trim();
    if (!dateColText && cached._domDateText) {
        dateColText = cached._domDateText;
    }

    const domOp = $currentRow.find('.td_operation').text()?.trim();
    const domStatus = $currentRow.find('.td_status').text()?.trim();
    const effectiveMeta = {
        ...meta,
        Operation: meta.Operation || domOp,
        Status: (meta.Status !== undefined && meta.Status !== null && meta.Status !== '') ? meta.Status : domStatus
    };

    const filename = buildApexLogFileName(effectiveMeta, currentLogId, dateColText, rowIndex, total);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    if (typeof saveAs !== 'undefined') {
        saveAs(blob, filename);
    } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    $('.snackbar').text(`Downloaded ${filename}`);
    showToast();
});

// Download All / Selected Saved Apex Logs as ZIP
$(document).on('click', '.top_download_all_btn', async function () {
    const $btn = $(this);
    if ($btn.prop('disabled')) return;

    if (sessionLogsCache.size === 0) {
        $('.snackbar').text('No saved logs available to download.');
        showToast();
        return;
    }

    if (typeof JSZip === 'undefined') {
        $('.snackbar').text('Zip library (JSZip) is not loaded.');
        showToast();
        return;
    }

    // Determine target logs matching the exact sequence sorted in the Apex logs section
    const domOrderedIds = [];
    const domDateTextMap = new Map();
    $('.log_table_body tr.tr[data-id]').each(function () {
        const id = $(this).attr('data-id');
        if (id && !domOrderedIds.includes(id)) {
            domOrderedIds.push(id);
            const dt = $(this).find('.td_date').text()?.trim();
            if (dt) domDateTextMap.set(id, dt);
        }
    });

    let orderedRecords = [];
    if (domOrderedIds.length > 0) {
        // Collect in exact DOM table sequence
        domOrderedIds.forEach(id => {
            const cached = sessionLogsCache.get(id);
            if (cached) {
                orderedRecords.push({ id, ...cached, _domDateText: domDateTextMap.get(id) });
            }
        });
        // Append any cached records not currently visible in DOM
        const missing = [];
        sessionLogsCache.forEach((cached, id) => {
            if (!domOrderedIds.includes(id)) {
                missing.push({ id, ...cached });
            }
        });
        if (missing.length > 0) {
            const sortedMissing = sortRecordsList(missing.map(r => r.metadata).filter(Boolean));
            sortedMissing.forEach(meta => {
                const cached = sessionLogsCache.get(meta.Id);
                if (cached) orderedRecords.push({ id: meta.Id, ...cached });
            });
        }
    } else {
        // Fallback: sort records using the active table sort configuration
        const allRecords = Array.from(sessionLogsCache.values()).map(r => r.metadata).filter(Boolean);
        const sorted = sortRecordsList(allRecords);
        sorted.forEach(meta => {
            const cached = sessionLogsCache.get(meta.Id);
            if (cached) orderedRecords.push({ id: meta.Id, ...cached });
        });
    }

    // Determine target logs: if checkboxes are checked, filter preserving sequence; otherwise export all in sequence
    const useSelected = selectedLogCheckboxes.size > 0;
    let recordsToExport = [];

    if (useSelected) {
        recordsToExport = orderedRecords.filter(item => selectedLogCheckboxes.has(item.id));
    } else {
        recordsToExport = orderedRecords;
    }

    if (recordsToExport.length === 0) {
        $('.snackbar').text('No saved logs found to download.');
        showToast();
        return;
    }

    const total = recordsToExport.length;
    const originalHtml = $btn.html();
    $btn.prop('disabled', true);

    try {
        const zip = new JSZip();
        let fetchedCount = 0;

        for (let i = 0; i < total; i++) {
            const item = recordsToExport[i];
            const meta = item.metadata || {};
            const logId = item.id || meta.Id;

            $btn.html(`<i class="fa fa-spinner fa-spin"></i> <span>Zipping (${i + 1}/${total})...</span>`);

            let logBody = item.body;
            if (!logBody && logId) {
                try {
                    logBody = await getLogDataWithCache(logId);
                } catch (fetchErr) {
                    console.warn('Failed to fetch log body for ' + logId, fetchErr);
                    logBody = `// Failed to retrieve log body for ${logId} from Salesforce: ${fetchErr.message || fetchErr}\n`;
                }
            }

            if (!logBody) {
                logBody = `// Empty log body for Log ID: ${logId}\n`;
            }

            const logFileName = buildApexLogFileName(meta, logId, item._domDateText, i + 1, total);

            zip.file(logFileName, logBody);
            fetchedCount++;
        }

        $btn.html('<i class="fa fa-spinner fa-spin"></i> <span>Compressing...</span>');

        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        const rawUser = $('.top_username_text').text()?.trim() || 'Salesforce';
        const safeUser = rawUser.replace(/[/\\?%*:|"<> ]+/g, '_');
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;

        let localTimeStr = '';
        try {
            localTimeStr = Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
        } catch (e) {
            localTimeStr = '';
        }
        if (!localTimeStr) {
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            localTimeStr = `${hours}-${minutes}-${seconds}`;
        }
        const cleanLocalTime = localTimeStr.replace(/:/g, '-').replace(/[/\\?%*:|"<>]/g, '_').trim();
        const zipName = `ApexLogs_${safeUser}_${localDateStr}_${cleanLocalTime}.zip`;

        if (typeof saveAs !== 'undefined') {
            saveAs(zipBlob, zipName);
        } else {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(zipBlob);
            a.download = zipName;
            a.click();
        }

        $('.snackbar').text(`Successfully downloaded ${fetchedCount} log${fetchedCount > 1 ? 's' : ''} as ${zipName}`);
        showToast();
    } catch (err) {
        console.error('Error creating zip of apex logs:', err);
        $('.snackbar').text('Error zipping logs: ' + (err.message || err));
        showToast();
    } finally {
        $btn.prop('disabled', false).html(originalHtml);
    }
});

// ==========================================
// APEX OBJECT & TREE INSPECTOR INTERACTION
// ==========================================

// Click header to expand or collapse node
$(document).on('click', '.sf_tree_header', function (e) {
    if ($(e.target).closest('.btn_copy_json').length > 0) {
        return;
    }
    e.stopPropagation();

    const $header = $(this);
    const $node = $header.closest('.sf_tree_node');
    const $caret = $header.find('> .sf_caret');
    const $children = $node.find('> .sf_tree_children');

    const isExpanded = $node.hasClass('is-expanded');

    if (isExpanded) {
        $node.removeClass('is-expanded');
        $caret.removeClass('is-open');
        $children.slideUp(100);
    } else {
        $node.addClass('is-expanded');
        $caret.addClass('is-open');
        $children.slideDown(100);
    }
});

// Copy single object as formatted JSON
$(document).on('click', '.btn_copy_json', function (e) {
    e.stopPropagation();
    let lineNum = $(this).attr('data-line-num');
    if (!lineNum) lineNum = $(this).closest('.log_row').attr('data-line-num');
    let node = lineNum ? parsedStructuresByLineNum.get(Number(lineNum)) : null;
    let jsonToCopy = '';

    if (node) {
        try {
            jsonToCopy = JSON.stringify(apexNodeToJson(node), null, 2);
        } catch (e) { }
    }
    if (!jsonToCopy) {
        const rawJson = $(this).attr('data-json');
        if (rawJson) {
            try {
                const decoded = decodeURIComponent(rawJson);
                jsonToCopy = JSON.stringify(JSON.parse(decoded), null, 2);
            } catch (err) {
                jsonToCopy = rawJson;
            }
        }
    }

    if (!jsonToCopy) return;

    navigator.clipboard.writeText(jsonToCopy).then(() => {
        $('.snackbar').text('Copied object as formatted JSON!');
        showToast();
    }).catch(() => {
        navigator.clipboard.writeText(jsonToCopy);
        $('.snackbar').text('Copied object JSON!');
        showToast();
    });
});

// Toggle Timestamps visibility in logs
$(document).on('change', '#toggleTimestampCb', function () {
    const show = $(this).is(':checked');
    if (show) {
        $('.d_down_viewer_content').removeClass('hide-timestamps');
    } else {
        $('.d_down_viewer_content').addClass('hide-timestamps');
    }
    applyFilters();
});

// Toggle between Formatted Objects View and Raw Text View
$(document).on('click', '.toggle_tree_mode_btn', function () {
    isFormattedViewMode = !isFormattedViewMode;
    const $btn = $(this);
    const $viewer = $('.d_down_viewer_content');
    const $textarea = $('.d_down_textarea');
    const $expandBtn = $('.toggle_all_nodes_btn');

    if (isFormattedViewMode) {
        $btn.addClass('is-active').attr('title', 'Switch to Raw Text View');
        $btn.find('.btn_view_mode_text').text('Formatted');
        $viewer.removeClass('hide');
        $textarea.addClass('hide');
        $expandBtn.show();
    } else {
        syncRawTextarea();
        $btn.removeClass('is-active').attr('title', 'Switch to Formatted Objects View');
        $btn.find('.btn_view_mode_text').text('Raw');
        $viewer.addClass('hide');
        $textarea.removeClass('hide');
        $expandBtn.hide();
    }
});

// Expand All / Collapse All Objects in view
$(document).on('click', '.toggle_all_nodes_btn', function () {
    areAllNodesExpanded = !areAllNodesExpanded;
    const $btn = $(this);
    const $viewer = $('.d_down_viewer_content');
    const $allNodes = $viewer.find('.sf_tree_node');
    const $allCarets = $viewer.find('.sf_caret');
    const $allChildren = $viewer.find('.sf_tree_children');

    if (areAllNodesExpanded) {
        $btn.addClass('is-active');
        $btn.find('i').removeClass('fa-expand').addClass('fa-compress');
        $btn.find('.btn_expand_all_text').text('Collapse All');
        $allNodes.addClass('is-expanded');
        $allCarets.addClass('is-open');
        $allChildren.show();
    } else {
        $btn.removeClass('is-active');
        $btn.find('i').removeClass('fa-compress').addClass('fa-expand');
        $btn.find('.btn_expand_all_text').text('Expand All');
        $allNodes.removeClass('is-expanded');
        $allCarets.removeClass('is-open');
        $allChildren.hide();
    }

    if (window.ApexLogVirtualizer && window.ApexLogVirtualizer.isMounted && window.ApexLogVirtualizer.isMounted() && lastFilteredResult) {
        window.ApexLogVirtualizer.update({
            lines: lastFilteredResult.filteredLines,
            textSearch: $('.viewer_text_search_inp').val() || ''
        });
    }
});

// Jump through error lines in viewer
$(document).on('click', '.viewer_error_jump_btn', function () {
    if (window.ApexLogVirtualizer && window.ApexLogVirtualizer.isMounted && window.ApexLogVirtualizer.isMounted()) {
        if (!currentErrorLineIndices || currentErrorLineIndices.length === 0) return;
        currentErrorJumpIndex = (currentErrorJumpIndex + 1) % currentErrorLineIndices.length;
        const targetLineIndex = currentErrorLineIndices[currentErrorJumpIndex];
        window.ApexLogVirtualizer.scrollToLine(targetLineIndex);
        return;
    }

    const $viewer = $('.d_down_viewer_content');
    const $errorRows = $viewer.find('.log_row_error');
    if (!$errorRows.length) return;

    currentErrorJumpIndex = (currentErrorJumpIndex + 1) % $errorRows.length;
    const $target = $errorRows.eq(currentErrorJumpIndex);

    const targetTop = $target.position().top + $viewer.scrollTop();
    $viewer.animate({ scrollTop: targetTop - 50 }, 200);

    $('.log_row_error').removeClass('error_focus_target');
    $target.addClass('error_focus_target');
    setTimeout(() => {
        $target.removeClass('error_focus_target');
    }, 2000);
});

// ==========================================
// COLUMN RESIZERS CONTROLLER (BOTH SPLITTERS)
// ==========================================

function initColumnResizers() {
    const leftResizer = document.getElementById('resizerLeft');
    const rightResizer = document.getElementById('resizerRight');
    const leftPanel = document.querySelector('.event_filter_panel');
    const rightPanel = document.querySelector('.d_down_logs_dv');
    const container = document.querySelector('.down_c');

    if (!leftResizer || !rightResizer || !leftPanel || !rightPanel || !container) {
        return;
    }

    // Restore saved widths from localStorage
    try {
        const savedLeftWidth = localStorage.getItem('sfqa_debug_left_width');
        if (savedLeftWidth) {
            const w = parseInt(savedLeftWidth, 10);
            if (w >= 200 && w <= 800) {
                leftPanel.style.width = w + 'px';
            }
        }
        const savedRightWidth = localStorage.getItem('sfqa_debug_right_width');
        if (savedRightWidth) {
            const w = parseInt(savedRightWidth, 10);
            if (w >= 220 && w <= 800) {
                rightPanel.style.width = w + 'px';
            }
        }
    } catch (e) {
        console.error('Error restoring panel widths:', e);
    }

    let isDraggingLeft = false;
    let isDraggingRight = false;

    leftResizer.addEventListener('mousedown', function (e) {
        e.preventDefault();
        isDraggingLeft = true;
        leftResizer.classList.add('resizing');
        document.body.classList.add('is-resizing');
    });

    rightResizer.addEventListener('mousedown', function (e) {
        e.preventDefault();
        isDraggingRight = true;
        rightResizer.classList.add('resizing');
        document.body.classList.add('is-resizing');
    });

    // Double-click to reset default width
    leftResizer.addEventListener('dblclick', function () {
        leftPanel.style.width = '330px';
        try { localStorage.setItem('sfqa_debug_left_width', '330'); } catch (e) { }
    });

    rightResizer.addEventListener('dblclick', function () {
        rightPanel.style.width = '460px';
        try { localStorage.setItem('sfqa_debug_right_width', '460'); } catch (e) { }
    });

    window.addEventListener('mousemove', function (e) {
        if (!isDraggingLeft && !isDraggingRight) return;

        const containerRect = container.getBoundingClientRect();
        const totalWidth = containerRect.width;

        if (isDraggingLeft) {
            let newWidth = e.clientX - containerRect.left;
            const minWidth = 200;
            const maxWidth = Math.min(700, totalWidth - 450);
            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;

            leftPanel.style.width = newWidth + 'px';
            try {
                localStorage.setItem('sfqa_debug_left_width', Math.round(newWidth));
            } catch (err) { }
        }

        if (isDraggingRight) {
            const leftPanelWidth = leftPanel.getBoundingClientRect().width;
            const minCenterWidth = 260; // Guarantee center viewer always has enough room
            const minWidth = 220;
            const maxWidth = Math.max(minWidth, totalWidth - leftPanelWidth - minCenterWidth - 10);

            let newWidth = containerRect.right - e.clientX;
            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;

            rightPanel.style.width = newWidth + 'px';
            try {
                localStorage.setItem('sfqa_debug_right_width', Math.round(newWidth));
            } catch (err) { }
        }
    });

    window.addEventListener('mouseup', function () {
        if (isDraggingLeft || isDraggingRight) {
            isDraggingLeft = false;
            isDraggingRight = false;
            leftResizer.classList.remove('resizing');
            rightResizer.classList.remove('resizing');
            document.body.classList.remove('is-resizing');
        }
    });
}

// ==========================================
// SCROLLBAR HOVER CURSOR HANDLER
// ==========================================

function initScrollbarCursorHandlers() {
    function bindScrollbarHover(elementSelector, defaultCursor = 'default') {
        const el = document.querySelector(elementSelector);
        if (!el) return;

        let isMouseDownOnScrollbar = false;

        el.addEventListener('mousedown', function (e) {
            const rect = el.getBoundingClientRect();
            const hasVScroll = el.scrollHeight > el.clientHeight;
            const hasHScroll = el.scrollWidth > el.clientWidth;

            const isOverVScroll = hasVScroll && (e.clientX >= rect.left + el.clientWidth);
            const isOverHScroll = hasHScroll && (e.clientY >= rect.top + el.clientHeight);

            if (isOverVScroll || isOverHScroll) {
                isMouseDownOnScrollbar = true;
                el.style.cursor = 'pointer';
                document.body.style.cursor = 'pointer';
            }
        });

        window.addEventListener('mouseup', function () {
            if (isMouseDownOnScrollbar) {
                isMouseDownOnScrollbar = false;
                document.body.style.cursor = '';
            }
        });

        el.addEventListener('mousemove', function (e) {
            if (isMouseDownOnScrollbar) {
                el.style.cursor = 'pointer';
                return;
            }

            const rect = el.getBoundingClientRect();
            const hasVScroll = el.scrollHeight > el.clientHeight;
            const hasHScroll = el.scrollWidth > el.clientWidth;

            const isOverVScroll = hasVScroll && (e.clientX >= rect.left + el.clientWidth);
            const isOverHScroll = hasHScroll && (e.clientY >= rect.top + el.clientHeight);

            if (isOverVScroll || isOverHScroll) {
                el.style.cursor = 'pointer';
            } else {
                el.style.cursor = defaultCursor;
            }
        });

        el.addEventListener('mouseleave', function () {
            if (!isMouseDownOnScrollbar) {
                el.style.cursor = defaultCursor;
            }
        });
    }

    bindScrollbarHover('.d_down_textarea', 'text');
    bindScrollbarHover('.d_down_viewer_content', 'default');
    bindScrollbarHover('.logs_table_wrapper', 'default');
    bindScrollbarHover('.d_down_logs_dv', 'default');
    bindScrollbarHover('.filter_panel_body', 'default');
}

/* ========================================================
   THEME TOGGLE & KEYBOARD SHORTCUTS
   ======================================================== */
$(document).on('click', '.top_theme_btn', function () {
    const isDark = $('body').hasClass('theme-dark');
    applyTheme(isDark ? 'light' : 'dark');
});

$(document).on('click', '.top_bw_btn', function () {
    const isBw = $('body').hasClass('mode-bw');
    applyBwMode(!isBw);
});

$(document).on('keydown', function (e) {
    if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        $('.top_theme_btn').click();
    }
    if (e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        $('.top_bw_btn').click();
    }
});

/* ========================================================
   APEX LOGS CHECKBOX & ACCORDION GROUPING EVENT HANDLERS
   ======================================================== */
$(document).on('click', '.td_checkbox, .log_row_checkbox', function (e) {
    e.stopPropagation();
});

$(document).on('change', '.log_row_checkbox', function () {
    const logId = $(this).attr('data-id');
    if (!logId) return;
    if ($(this).is(':checked')) {
        selectedLogCheckboxes.add(logId);
    } else {
        selectedLogCheckboxes.delete(logId);
    }
    updateGroupSelectionUI();
});

$(document).on('change', '.log_master_checkbox', function () {
    const isChecked = $(this).is(':checked');
    $('.log_row_checkbox').each(function () {
        const id = $(this).attr('data-id');
        $(this).prop('checked', isChecked);
        if (id) {
            if (isChecked) selectedLogCheckboxes.add(id);
            else selectedLogCheckboxes.delete(id);
        }
    });
    updateGroupSelectionUI();
});

$(document).on('click', '.btn_group_selected', async function () {
    const selectedIds = Array.from(selectedLogCheckboxes);
    if (!selectedIds.length) return;

    let defaultOp = '';
    for (const id of selectedIds) {
        const cached = sessionLogsCache.get(id);
        if (cached?.metadata?.Operation) {
            defaultOp = cached.metadata.Operation;
            break;
        }
    }
    loadLogGroups();
    const defaultName = defaultOp ? `Transaction - ${defaultOp}` : `Transaction Group ${logGroups.length + 1}`;

    let groupName = '';
    if (typeof Swal !== 'undefined' && Swal.fire) {
        const { value: name, isConfirmed } = await Swal.fire({
            title: 'Group Selected Logs',
            input: 'text',
            inputLabel: 'Enter a group / transaction name:',
            inputValue: defaultName,
            showCancelButton: true,
            confirmButtonText: '<i class="fa fa-folder"></i> Group Logs',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#0284c7',
            inputValidator: (val) => {
                if (!val || !val.trim()) {
                    return 'Please enter a group name';
                }
            }
        });
        if (!isConfirmed || !name) return;
        groupName = name.trim();
    } else {
        const entered = window.prompt('Enter group or transaction name:', defaultName);
        if (!entered || !entered.trim()) return;
        groupName = entered.trim();
    }

    const selectedSet = new Set(selectedIds);
    logGroups.forEach(g => {
        g.logIds = g.logIds.filter(id => !selectedSet.has(id));
    });
    logGroups = logGroups.filter(g => g.logIds.length > 0);

    const newGroup = {
        id: 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: groupName,
        collapsed: false,
        logIds: selectedIds,
        createdAt: Date.now()
    };
    logGroups.unshift(newGroup);
    saveLogGroups();

    selectedLogCheckboxes.clear();

    const allRecords = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
    renderLogsTable(allRecords);

    $('.snackbar').text(`Grouped ${selectedIds.length} logs under "${groupName}"`);
    showToast();
});

$(document).on('click', '.log_group_header_tr', function (e) {
    if ($(e.target).closest('.btn_group_action').length) return;
    const groupId = $(this).attr('data-group-id');
    if (!groupId) return;

    loadLogGroups();
    const group = logGroups.find(g => g.id === groupId);
    if (!group) return;

    group.collapsed = !group.collapsed;
    saveLogGroups();

    const isCollapsed = group.collapsed;
    $(this).toggleClass('is-collapsed', isCollapsed);
    $(this).find('.btn_toggle_group i')
        .removeClass('fa-chevron-right fa-chevron-down')
        .addClass(isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down');
    $(this).find('.log_group_folder_icon i')
        .removeClass('fa-folder fa-folder-open')
        .addClass(isCollapsed ? 'fa-folder' : 'fa-folder-open');

    const $childRows = $(`.log_table tbody tr.tr_grouped[data-group-id="${groupId}"]`);
    if (isCollapsed) {
        $childRows.addClass('hide');
    } else {
        $childRows.removeClass('hide');
    }
});

$(document).on('click', '.btn_rename_group', async function (e) {
    e.stopPropagation();
    const groupId = $(this).attr('data-group-id');
    loadLogGroups();
    const group = logGroups.find(g => g.id === groupId);
    if (!group) return;

    let newName = '';
    if (typeof Swal !== 'undefined' && Swal.fire) {
        const { value: name, isConfirmed } = await Swal.fire({
            title: 'Rename Group',
            input: 'text',
            inputValue: group.name,
            showCancelButton: true,
            confirmButtonText: 'Rename',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#0284c7',
            inputValidator: (val) => {
                if (!val || !val.trim()) return 'Name cannot be empty';
            }
        });
        if (!isConfirmed || !name) return;
        newName = name.trim();
    } else {
        const entered = window.prompt('Rename group:', group.name);
        if (!entered || !entered.trim()) return;
        newName = entered.trim();
    }

    group.name = newName;
    saveLogGroups();
    $(`.log_group_header_tr[data-group-id="${groupId}"] .log_group_title`).text(newName).attr('title', newName);
    $('.snackbar').text(`Group renamed to "${newName}"`);
    showToast();
});

$(document).on('click', '.btn_ungroup', async function (e) {
    e.stopPropagation();
    const groupId = $(this).attr('data-group-id');
    loadLogGroups();
    const groupIndex = logGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;

    const groupName = logGroups[groupIndex].name;
    logGroups.splice(groupIndex, 1);
    saveLogGroups();

    const allRecords = Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);
    renderLogsTable(allRecords);

    $('.snackbar').text(`Ungrouped "${groupName}"`);
    showToast();
});

// Column Sorting Handler (Length and Date Time)
$(document).on('click', '.sortable_col', function () {
    const sortKey = $(this).attr('data-sort-key');
    if (!sortKey) return;

    if (currentSortColumn === sortKey) {
        currentSortOrder = (currentSortOrder === 'ASC') ? 'DESC' : 'ASC';
    } else {
        currentSortColumn = sortKey;
        // Default to ASC for Date Time (oldest first); default to DESC for Length (largest first)
        currentSortOrder = (sortKey === 'LastModifiedDate') ? 'ASC' : 'DESC';
    }

    const recordsToRender = (currentRenderedRecords && currentRenderedRecords.length > 0)
        ? currentRenderedRecords
        : Array.from(sessionLogsCache.values()).map(item => item.metadata).filter(Boolean);

    if (recordsToRender && recordsToRender.length > 0) {
        renderLogsTable(recordsToRender);
    } else {
        updateSortHeadersUI();
    }
});

/* ========================================================
   APEX CLASS / TRIGGER VIEWER & LINKIFICATION
   ======================================================== */

/**
 * Loads all ApexClass and ApexTrigger names from the Salesforce org via Tooling API.
 * Populates orgApexClassesMap for instant link detection in logs.
 */
async function loadOrgApexClasses() {
    try {
        if (!baseUrl || !sessionId) return;
        const qClasses = 'SELECT Id, Name, NamespacePrefix FROM ApexClass ORDER BY Name ASC';
        const resClasses = await fetch(toolingQueryUrl(qClasses), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
        if (resClasses.ok) {
            const data = await resClasses.json();
            if (data && data.records) {
                data.records.forEach(r => {
                    if (r && r.Name) {
                        orgApexClassesMap.set(r.Name.toLowerCase(), {
                            id: r.Id,
                            name: r.Name,
                            namespace: r.NamespacePrefix || '',
                            isTrigger: false
                        });
                    }
                });
            }
        }

        // Also fetch ApexTriggers
        try {
            const qTrig = 'SELECT Id, Name, TableEnumOrId, NamespacePrefix FROM ApexTrigger ORDER BY Name ASC';
            const resTrig = await fetch(toolingQueryUrl(qTrig), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
            if (resTrig.ok) {
                const tData = await resTrig.json();
                if (tData && tData.records) {
                    tData.records.forEach(r => {
                        if (r && r.Name) {
                            orgApexClassesMap.set(r.Name.toLowerCase(), {
                                id: r.Id,
                                name: r.Name,
                                namespace: r.NamespacePrefix || '',
                                isTrigger: true
                            });
                        }
                    });
                }
            }
        } catch (te) {
            console.warn('loadOrgApexTriggers warning:', te);
        }

        invalidateOrgClassesCache();
        console.log(`Loaded ${orgApexClassesMap.size} Apex classes & triggers for quick linking.`);

        // Re-apply filters if a log is already open to immediately make class names clickable
        if (rawLogData) {
            applyFilters();
        }
    } catch (e) {
        console.warn('loadOrgApexClasses error:', e);
    }
}

/**
 * Formats a log line smartly according to Salesforce Apex debug log syntax:
 * 1. Apex Class Name -> Sky blue (.apex_class_link)
 * 2. Apex Constructor Name -> Dark yellow (.apex_constructor_name)
 * 3. Apex Method Name -> Green (.apex_method_name)
 * 4. System / Salesforce / Database methods -> Plain unhighlighted text (no class/method color)
 * 5. Does NOT assume capitalized words are classes. Only verified Apex classes are highlighted.
 */
function formatApexLogLine(rawText, searchLower) {
    if (!rawText || typeof rawText !== 'string') return '';

    // Fast path: If no search term is active and line has no Apex class or method identifiers, escape and return immediately
    if (!searchLower) {
        const orgRe = getCachedOrgClassesRegex();
        const hasApexIndicators = rawText.includes('METHOD_') || rawText.includes('CONSTRUCTOR_') || rawText.includes('01p') || rawText.includes('01q') || rawText.includes('Class.') || (orgRe && orgRe.test(rawText));
        if (!hasApexIndicators) {
            return escapeHtml(rawText);
        }
    }

    // 1. Check for METHOD_ENTRY / METHOD_EXIT with 4 pipe-delimited fields
    // e.g. METHOD_ENTRY|[292]|01pUo0000004kVh|PlanElectionCompUtility.fetchAllFieldQuery(String)
    // e.g. METHOD_ENTRY|[9]|01p0L000002ylgS|HomeController.HomeController()
    // e.g. METHOD_ENTRY|[360]||System.Url.getCurrentRequestUrl()
    const methodEntryMatch = rawText.match(/^(METHOD_ENTRY|METHOD_EXIT)\|(\[[^\]]*\])\|([^\|]*)\|(.*)$/);
    if (methodEntryMatch) {
        const event = methodEntryMatch[1];
        const lineInfo = methodEntryMatch[2];
        const classId = methodEntryMatch[3];
        const signature = methodEntryMatch[4];

        const isSystemCall = !classId ||
            classId.trim() === '' ||
            /^(System|Database|Schema|UserInfo|JSON|Test|Messaging|ApexPages|Limits|EventBus|Crypto|Math|RestContext|ConnectApi|Auth|QuickAction|Approval|Canvas|Chatter|Reports|Search|Site|Network|Wave|Commerce|String|Integer|Boolean|Decimal|Double|Long|Date|Datetime|Time|Blob|Id|Object|List|Set|Map|SObject|PageReference|com\.salesforce)\b/i.test(signature);

        if (isSystemCall) {
            // Requirement 3: System / Salesforce methods should NOT be highlighted / colored
            return highlightText(rawText, searchLower);
        }

        // Custom Apex method or constructor
        const sigMatch = signature.match(/^(.*?)\.([A-Za-z0-9_]+)(\(.*?\))?$/);
        if (sigMatch) {
            const targetStr = sigMatch[1];
            const memberName = sigMatch[2];
            const params = sigMatch[3] || '';

            const targetLower = targetStr.toLowerCase();
            const memberLower = memberName.toLowerCase();
            const targetParts = targetStr.split('.');
            const lastClassPart = targetParts[targetParts.length - 1];

            const isConstructor = (memberLower === '<init>') ||
                                  (memberLower === targetLower) ||
                                  (memberLower === lastClassPart.toLowerCase());

            // Build target class HTML (sky blue)
            let classHtml = '';
            for (let i = 0; i < targetParts.length; i++) {
                const part = targetParts[i];
                if (i > 0) classHtml += '.';
                const org = orgApexClassesMap.get(part.toLowerCase());
                const effectiveId = (org && org.id) ? org.id : classId;
                classHtml += `<span class="apex_class_link" data-class="${escapeHtml(part)}" data-id="${escapeHtml(effectiveId)}" title="View Apex Source Code: ${escapeHtml(part)}">${highlightText(part, searchLower)}</span>`;
            }

            // Build member HTML (constructor = dark yellow, method = green)
            const mainClassName = targetParts[0];
            let memberHtml = '';
            if (isConstructor) {
                memberHtml = `<span class="apex_constructor_name" data-class="${escapeHtml(mainClassName)}" data-id="${escapeHtml(classId)}" data-member="${escapeHtml(memberName)}" title="Apex Constructor: ${escapeHtml(memberName)}">${highlightText(memberName, searchLower)}</span>`;
            } else {
                memberHtml = `<span class="apex_method_name" data-class="${escapeHtml(mainClassName)}" data-id="${escapeHtml(classId)}" data-member="${escapeHtml(memberName)}" title="Apex Method: ${escapeHtml(memberName)}">${highlightText(memberName, searchLower)}</span>`;
            }

            const prefixHtml = `${highlightText(event, searchLower)}|${highlightText(lineInfo, searchLower)}|${highlightText(classId, searchLower)}|`;
            const paramsHtml = params ? highlightText(params, searchLower) : '';

            return `${prefixHtml}${classHtml}.${memberHtml}${paramsHtml}`;
        }
    }

    // 2. Check for METHOD_EXIT with 2 pipes
    // e.g. METHOD_EXIT|[9]|HomeController
    const exit2Match = rawText.match(/^(METHOD_EXIT)\|(\[[^\]]*\])\|([^\|]+)$/);
    if (exit2Match) {
        const event = exit2Match[1];
        const lineInfo = exit2Match[2];
        const target = exit2Match[3];
        const org = orgApexClassesMap.get(target.toLowerCase());
        if (org && !isBuiltinApexType(target)) {
            const prefixHtml = `${highlightText(event, searchLower)}|${highlightText(lineInfo, searchLower)}|`;
            const classHtml = `<span class="apex_class_link" data-class="${escapeHtml(org.name)}" data-id="${escapeHtml(org.id)}" title="View Apex Source Code: ${escapeHtml(org.name)}">${highlightText(target, searchLower)}</span>`;
            return `${prefixHtml}${classHtml}`;
        }
    }

    // 3. Check for CONSTRUCTOR_ENTRY / CONSTRUCTOR_EXIT
    // e.g. CONSTRUCTOR_ENTRY|[218]|01p0L000002zIR1|<init>(Id)|CoverageDisplayManager
    const constrMatch = rawText.match(/^(CONSTRUCTOR_ENTRY|CONSTRUCTOR_EXIT)\|(\[[^\]]*\])\|(01p[A-Za-z0-9]{12,15})\|(<init>(?:\([^)]*\))?)\|(.*)$/);
    if (constrMatch) {
        const event = constrMatch[1];
        const lineInfo = constrMatch[2];
        const classId = constrMatch[3];
        const initCall = constrMatch[4];
        const targetClass = constrMatch[5];

        const prefixHtml = `${highlightText(event, searchLower)}|${highlightText(lineInfo, searchLower)}|${highlightText(classId, searchLower)}|`;
        const initParts = initCall.match(/^(<init>)(\(.*?\))?$/);
        let initHtml = '';
        if (initParts) {
            initHtml = `<span class="apex_constructor_name" data-class="${escapeHtml(targetClass)}" data-id="${escapeHtml(classId)}" data-member="<init>" title="Apex Constructor: <init>">${highlightText(initParts[1], searchLower)}</span>${initParts[2] ? highlightText(initParts[2], searchLower) : ''}`;
        } else {
            initHtml = highlightText(initCall, searchLower);
        }

        const classHtml = `<span class="apex_class_link" data-class="${escapeHtml(targetClass)}" data-id="${escapeHtml(classId)}" title="View Apex Source Code: ${escapeHtml(targetClass)}">${highlightText(targetClass, searchLower)}</span>`;
        return `${prefixHtml}${initHtml}|${classHtml}`;
    }

    // 4. Check for system constructor/method events (e.g. SYSTEM_METHOD_ENTRY, SYSTEM_CONSTRUCTOR_ENTRY)
    if (/^SYSTEM_/i.test(rawText)) {
        return highlightText(rawText, searchLower);
    }

    // 5. Default: fallback to scanning verified org Apex classes in other lines
    if (orgApexClassesMap.size === 0 && !rawText.includes('Class.') && !rawText.includes('01p') && !rawText.includes('01q')) {
        return highlightText(rawText, searchLower);
    }

    // Preserves existing HTML tags and matches only registered Apex classes or Class./01p prefixes!
    const regex = getCachedOrgClassesRegex();

    return rawText.replace(regex, (m, pClass, cName, cMember, pId, cName2, standaloneWord) => {
        // Stack trace: Class.ClassName.memberName or Class.ClassName.<init>
        if (pClass && cName) {
            const org = orgApexClassesMap.get(cName.toLowerCase());
            const id = org ? org.id : '';
            let out = `Class.<span class="apex_class_link" data-class="${escapeHtml(cName)}" data-id="${escapeHtml(id)}" title="View Apex Source Code: ${escapeHtml(cName)}">${highlightText(cName, searchLower)}</span>`;
            if (cMember) {
                if (cMember.toLowerCase() === '<init>' || (org && cMember.toLowerCase() === org.name.toLowerCase())) {
                    out += `.<span class="apex_constructor_name" data-class="${escapeHtml(cName)}" data-id="${escapeHtml(id)}" data-member="${escapeHtml(cMember)}" title="Apex Constructor: ${escapeHtml(cMember)}">${highlightText(cMember, searchLower)}</span>`;
                } else {
                    out += `.<span class="apex_method_name" data-class="${escapeHtml(cName)}" data-id="${escapeHtml(id)}" data-member="${escapeHtml(cMember)}" title="Apex Method: ${escapeHtml(cMember)}">${highlightText(cMember, searchLower)}</span>`;
                }
            }
            return out;
        }

        // 01p...|ClassName
        if (pId && cName2) {
            if (isBuiltinApexType(cName2)) return m;
            const org = orgApexClassesMap.get(cName2.toLowerCase());
            const id = org ? org.id : '';
            return `${escapeHtml(pId)}<span class="apex_class_link" data-class="${escapeHtml(cName2)}" data-id="${escapeHtml(id)}" title="View Apex Source Code: ${escapeHtml(cName2)}">${highlightText(cName2, searchLower)}</span>`;
        }

        // Standalone word: ONLY match if registered in orgApexClassesMap and NOT in BUILTIN_APEX_TYPES!
        if (standaloneWord) {
            const wLower = standaloneWord.toLowerCase();
            if (isBuiltinApexType(wLower)) return highlightText(standaloneWord, searchLower);
            const org = orgApexClassesMap.get(wLower);
            if (org && org.name.toLowerCase() === wLower) {
                return `<span class="apex_class_link" data-class="${escapeHtml(org.name)}" data-id="${escapeHtml(org.id)}" title="View Apex Source Code: ${escapeHtml(org.name)}">${highlightText(standaloneWord, searchLower)}</span>`;
            }
            return highlightText(standaloneWord, searchLower);
        }

        return highlightText(m, searchLower);
    });
}

function linkifyApexClasses(html, searchLower) {
    if (!html || typeof html !== 'string') return html;
    return formatApexLogLine(html, searchLower);
}

// Ensure Windows laptop standard Ctrl+F / Cmd+F flushes any pending background render lines immediately
$(window).on('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F' || e.keyCode === 70)) {
        if (typeof pendingRenderFlush === 'function') {
            pendingRenderFlush();
        }
    }
});

/**
 * Accurately finds the definition line of an Apex method, constructor, or class.
 * Avoids false positive jumps to method calls, assignments, or comments.
 */
function findApexDefinition(body, targetMember, className) {
    if (!body) return null;

    const lines = body.split(/\r?\n/);
    const memberEsc = targetMember ? targetMember.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const classEsc = className ? className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

    let inBlockComment = false;

    function isCommented(trimmed) {
        if (inBlockComment) {
            if (trimmed.includes('*/')) inBlockComment = false;
            return true;
        }
        if (trimmed.startsWith('/*')) {
            if (!trimmed.includes('*/')) inBlockComment = true;
            return true;
        }
        if (trimmed.startsWith('//')) return true;
        return false;
    }

    // CASE 1: No member name provided, or clicked on the Class itself
    if (!targetMember || targetMember === className) {
        if (classEsc) {
            const classPattern = new RegExp(
                `^\\s*(?:(?:public|private|global|abstract|virtual)\\s+)?(?:(?:with|without|inherited)\\s+sharing\\s+)?(?:class|interface|enum)\\s+${classEsc}\\b`,
                'i'
            );
            const triggerPattern = new RegExp(
                `^\\s*trigger\\s+${classEsc}\\s+on\\b`,
                'i'
            );
            inBlockComment = false;
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (isCommented(trimmed)) continue;
                if (classPattern.test(lines[i]) || triggerPattern.test(lines[i])) {
                    return { lineIndex: i, lineNumber: i + 1, lineText: lines[i], type: 'class' };
                }
            }
        }
    }

    // CASE 2: Constructor (<init> or matching constructor name)
    const isConstructor = targetMember === '<init>' || (targetMember && className && targetMember.toLowerCase() === className.toLowerCase());
    if (isConstructor && classEsc) {
        const ctorPattern = new RegExp(
            `^\\s*(?:(?:public|private|protected|global)\\s+)?${classEsc}\\s*\\(`,
            'i'
        );
        inBlockComment = false;
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (isCommented(trimmed)) continue;
            if (ctorPattern.test(lines[i])) {
                return { lineIndex: i, lineNumber: i + 1, lineText: lines[i], type: 'constructor' };
            }
        }
    }

    // CASE 3: Method Definition (when targetMember is a specific function name)
    if (targetMember && targetMember !== '<init>') {
        const methodPatterns = [
            // 3a. Explicit access modifier (public/private/protected/global/webservice):
            new RegExp(
                `^\\s*(?:@\\w+(?:\\([^)]*\\))?\\s+)*(?:public|private|protected|global|webservice)\\s+(?:static\\s+|override\\s+|testMethod\\s+|virtual\\s+|abstract\\s+)*(?:void|[A-Za-z0-9_<>,\\[\\]\\s]+?)\\s+${memberEsc}\\s*\\(`,
                'i'
            ),
            // 3b. Without access modifier, starting with void/static/type + methodName + '(':
            new RegExp(
                `^\\s*(?:static\\s+|override\\s+|virtual\\s+|testMethod\\s+)*(?:void|[A-Za-z0-9_<>,\\[\\]]+)\\s+${memberEsc}\\s*\\(`,
                'i'
            ),
            // 3c. Property definition (getter/setter):
            new RegExp(
                `^\\s*(?:@\\w+(?:\\([^)]*\\))?\\s+)*(?:public|private|protected|global)?\\s*(?:static\\s+)?(?:[A-Za-z0-9_<>,\\[\\]]+)\\s+${memberEsc}\\s*\\{`,
                'i'
            ),
            // 3d. Fallback: Any line where methodName is followed by '(' and preceded by a type/name without assignment/call markers
            new RegExp(
                `^\\s*(?!(?:return|if|while|for|switch|catch|new)\\b)[A-Za-z0-9_<>,\\[\\]\\s]*\\b${memberEsc}\\s*\\(`,
                'i'
            )
        ];

        for (const pattern of methodPatterns) {
            inBlockComment = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (isCommented(trimmed)) continue;

                // Ensure line doesn't contain assignment before method name (e.g. "x = method(") or call on object ("obj.method(")
                const methodIndex = line.indexOf(targetMember);
                if (methodIndex !== -1) {
                    const prefix = line.substring(0, methodIndex);
                    if (/[=.]\s*$/.test(prefix) || /\breturn\s+$/i.test(prefix) || /\bnew\s+$/i.test(prefix)) {
                        continue;
                    }
                }

                if (pattern.test(line)) {
                    return { lineIndex: i, lineNumber: i + 1, lineText: line, type: 'method' };
                }
            }
        }
    }

    // CASE 4: Fallback to Class Definition
    if (classEsc) {
        const classPattern = new RegExp(
            `^\\s*(?:(?:public|private|global|abstract|virtual)\\s+)?(?:(?:with|without|inherited)\\s+sharing\\s+)?(?:class|interface|enum)\\s+${classEsc}\\b`,
            'i'
        );
        inBlockComment = false;
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (isCommented(trimmed)) continue;
            if (classPattern.test(lines[i])) {
                return { lineIndex: i, lineNumber: i + 1, lineText: lines[i], type: 'class' };
            }
        }
    }

    // CASE 5: Absolute Fallback - first whole word match of targetMember or className
    const fallbackTarget = targetMember || className;
    if (fallbackTarget) {
        const fbRegex = new RegExp(`\\b${fallbackTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        inBlockComment = false;
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (isCommented(trimmed)) continue;
            if (fbRegex.test(lines[i])) {
                return { lineIndex: i, lineNumber: i + 1, lineText: lines[i], type: 'fallback' };
            }
        }
    }

    return null;
}

/**
 * Opens the big Apex Class Viewer modal in strictly READ-ONLY mode.
 * Loads the source code via Tooling API and auto-focuses on the class name or target member.
 */
async function openApexClassModal(className, classId, targetMember) {
    if (!className && !classId) return;

    let cleanName = (className || '').trim().replace(/[:;,()]+$/, '');
    if (cleanName.includes('.')) {
        cleanName = cleanName.split('.')[0];
    }

    // Display modal and reset state
    $('.apex_class_modal_backdrop').removeClass('hide');
    $('body').addClass('modal-open');
    $('.apex_class_modal_loading').removeClass('hide');
    $('.apex_class_modal_error').addClass('hide');
    $('#apexClassAceEditor').addClass('hide');

    $('.apex_class_modal_title').text(cleanName + '.cls');
    $('.apex_modal_badge.badge_type').text('Apex Class');
    $('.apex_modal_badge.badge_api_version').text('Loading...');
    currentLoadedApexRecord = null;

    try {
        let record = null;

        // 1. Query by Id if provided
        if (classId) {
            const isTriggerId = classId.startsWith('01q');
            const sobj = isTriggerId ? 'ApexTrigger' : 'ApexClass';
            const q = `SELECT Id, Name, Body, ApiVersion, Status, NamespacePrefix FROM ${sobj} WHERE Id = '${classId}'`;
            const res = await fetch(toolingQueryUrl(q), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
            if (res.ok) {
                const data = await res.json();
                if (data && data.records && data.records.length > 0) {
                    record = data.records[0];
                    record._type = sobj;
                }
            }
        }

        // 2. Query ApexClass by Name
        if (!record && cleanName) {
            const safeName = cleanName.replace(/'/g, "\\'");
            const q = `SELECT Id, Name, Body, ApiVersion, Status, NamespacePrefix FROM ApexClass WHERE Name = '${safeName}'`;
            const res = await fetch(toolingQueryUrl(q), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
            if (res.ok) {
                const data = await res.json();
                if (data && data.records && data.records.length > 0) {
                    record = data.records[0];
                    record._type = 'ApexClass';
                }
            }
        }

        // 3. Query ApexTrigger by Name if not found in ApexClass
        if (!record && cleanName) {
            const safeName = cleanName.replace(/'/g, "\\'");
            const q = `SELECT Id, Name, Body, ApiVersion, Status, NamespacePrefix, TableEnumOrId FROM ApexTrigger WHERE Name = '${safeName}'`;
            const res = await fetch(toolingQueryUrl(q), { method: 'GET', headers: authHeaders(), redirect: 'follow' });
            if (res.ok) {
                const data = await res.json();
                if (data && data.records && data.records.length > 0) {
                    record = data.records[0];
                    record._type = 'ApexTrigger';
                }
            }
        }

        if (!record) {
            $('.apex_class_modal_loading').addClass('hide');
            $('.apex_class_error_text').html(`Apex Class or Trigger "<strong>${escapeHtml(cleanName)}</strong>" could not be found in this Salesforce org.`);
            $('.apex_class_modal_error').removeClass('hide');
            return;
        }

        if (!record.Body && record.Body !== '') {
            // Source code is hidden by Salesforce (Managed Package)
            $('.apex_class_modal_loading').addClass('hide');
            $('.apex_class_error_text').html(`Source code for "<strong>${escapeHtml(record.Name)}</strong>" is protected by Salesforce (Managed Package code is hidden).`);
            $('.apex_class_modal_error').removeClass('hide');
            return;
        }

        currentLoadedApexRecord = record;
        const ext = record._type === 'ApexTrigger' ? '.trigger' : '.cls';
        $('.apex_class_modal_title').text(record.Name + ext);
        $('.apex_modal_badge.badge_type').text(record._type === 'ApexTrigger' ? 'Apex Trigger' : 'Apex Class');
        $('.apex_modal_badge.badge_api_version').text(`v${record.ApiVersion || '59.0'}`);

        $('.apex_class_modal_loading').addClass('hide');
        $('#apexClassAceEditor').removeClass('hide');

        // Initialize Ace Editor
        if (!apexClassAceEditor) {
            apexClassAceEditor = ace.edit('apexClassAceEditor');
            apexClassAceEditor.setShowPrintMargin(false);
            apexClassAceEditor.setFontSize(13);
            apexClassAceEditor.session.setMode('ace/mode/apex');
            apexClassAceEditor.session.setUseWrapMode(true);
            apexClassAceEditor.setReadOnly(true);
            apexClassAceEditor.setOptions({
                enableBasicAutocompletion: false,
                enableLiveAutocompletion: false,
                readOnly: true
            });
            if (apexClassAceEditor.renderer && apexClassAceEditor.renderer.scrollBarV) {
                apexClassAceEditor.renderer.scrollBarV.width = 14;
            }
        }

        const isDark = $('body').hasClass('theme-dark');
        apexClassAceEditor.setTheme(isDark ? 'ace/theme/tomorrow_night' : 'ace/theme/chrome');
        apexClassAceEditor.setReadOnly(true); // STRICTLY READ-ONLY
        apexClassAceEditor.setValue(record.Body || '', -1);
        apexClassAceEditor.setReadOnly(true); // Double ensure unmodifiable
        if (apexClassAceEditor.renderer) {
            apexClassAceEditor.renderer.onResize(true);
        }

        // Auto-focus and jump directly to the ACTUAL DEFINITION of the function, constructor, or class
        setTimeout(() => {
            if (apexClassAceEditor) {
                apexClassAceEditor.resize();

                const def = findApexDefinition(record.Body || '', targetMember, record.Name);
                if (def) {
                    const targetWord = (def.type === 'constructor' && targetMember === '<init>')
                        ? record.Name
                        : (targetMember || record.Name);
                    const colIndex = def.lineText.indexOf(targetWord);

                    if (colIndex !== -1 && typeof ace !== 'undefined') {
                        try {
                            const RangeClass = (ace.require && ace.require('ace/range')?.Range) || ace.Range;
                            if (RangeClass) {
                                apexClassAceEditor.selection.setRange(new RangeClass(def.lineIndex, colIndex, def.lineIndex, colIndex + targetWord.length));
                            } else {
                                apexClassAceEditor.gotoLine(def.lineNumber, colIndex, true);
                            }
                        } catch (e) {
                            apexClassAceEditor.gotoLine(def.lineNumber, colIndex, true);
                        }
                    } else {
                        apexClassAceEditor.gotoLine(def.lineNumber, 0, true);
                    }

                    try {
                        apexClassAceEditor.scrollToLine(def.lineNumber - 1, true, true, function () {});
                    } catch (e) { }
                    apexClassAceEditor.focus();
                } else {
                    // Fallback to text search if definition couldn't be parsed
                    const searchTarget = (targetMember && targetMember !== '<init>') ? targetMember : record.Name;
                    apexClassAceEditor.find(searchTarget, {
                        backwards: false,
                        wrap: true,
                        caseSensitive: true,
                        wholeWord: true,
                        regExp: false
                    });
                    apexClassAceEditor.focus();
                    try {
                        const row = apexClassAceEditor.getCursorPosition().row;
                        apexClassAceEditor.scrollToLine(row, true, true, function () {});
                    } catch (e) { }
                }
            }
        }, 100);

    } catch (err) {
        console.error('openApexClassModal error:', err);
        $('.apex_class_modal_loading').addClass('hide');
        $('.apex_class_error_text').html(`Error retrieving Apex class: ${escapeHtml(err.message || String(err))}`);
        $('.apex_class_modal_error').removeClass('hide');
    }
}

/**
 * Closes the Apex Class Viewer modal.
 */
function closeApexClassModal() {
    $('.apex_class_modal_backdrop').addClass('hide');
    $('body').removeClass('modal-open');
}

// Delegated click handler for any Apex Class, Constructor, or Method link in the logs
$(document).on('click', '.apex_class_link, .apex_constructor_name, .apex_method_name', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const className = $(this).attr('data-class');
    const classId = $(this).attr('data-id');
    const memberName = $(this).attr('data-member');
    if (className) {
        openApexClassModal(className, classId, memberName);
    }
});

// Close modal buttons and backdrop handlers
$(document).on('click', '.btn_modal_close', function (e) {
    e.preventDefault();
    closeApexClassModal();
});

$(document).on('click', '.apex_class_modal_backdrop', function (e) {
    if ($(e.target).hasClass('apex_class_modal_backdrop')) {
        closeApexClassModal();
    }
});

$(document).on('keydown', function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        if (!$('.apex_class_modal_backdrop').hasClass('hide')) {
            closeApexClassModal();
        }
    }
});

// Copy code button
$(document).on('click', '.btn_modal_copy_code', function () {
    if (!currentLoadedApexRecord || !currentLoadedApexRecord.Body) {
        $('.snackbar').text('No code to copy.');
        showToast();
        return;
    }
    navigator.clipboard.writeText(currentLoadedApexRecord.Body).then(() => {
        $('.snackbar').text(`Copied ${currentLoadedApexRecord.Name} code to clipboard!`);
        showToast();
    }).catch(err => {
        console.error('Failed to copy code:', err);
    });
});

// Open in Salesforce Setup button
$(document).on('click', '.btn_modal_open_sf', function () {
    if (!currentLoadedApexRecord || !currentLoadedApexRecord.Id) {
        $('.snackbar').text('Record ID not available.');
        showToast();
        return;
    }
    const sfUrl = `${baseUrl}/${currentLoadedApexRecord.Id}`;
    window.open(sfUrl, '_blank');
});
