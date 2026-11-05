let editor;
let recordsData;
let originalRecord;
let originalObjectDescribe;
let defaulRecordId;// = '0015h00000f9mpUAAQ';
// SZ000518 08P17-TLA-111
let keyPrefixAndObjectNameMap;
let objectName;
let currentRecordId;
let currentValue;
let currentFieldApiName;
let fieldApiNameAndFieldDataMap;
let fieldType;
let recordJSON;
let childRelationshipMap;
let baseUrl;// = 'https://techsimplifier-dev-ed.my.salesforce.com';
let sessionId;// = '00D5h000004xLOf!AQgAQJrs3Ng5CGbWFCrAHqIjBmTakpRZkjlb5yKI0ogJGjhxMj61uu.ML_fHn.S2xWMgzDTYFRYQUnInzqAS75ozuYPJ_IK8';

$(document).ready(function () {
    Draggable.create('.draggable');
    Draggable.create('.small_popup_box');
    hideSpinner2();
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    setSessionText();
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    let _recordID = url.searchParams.get('recordID');
    console.log('$_recordID: ', _recordID);
    if (_recordID) {
        defaulRecordId = _recordID;
    }
    $('.inp-search-1').val(defaulRecordId);
    showSpinner();
    getObjects();
    /* let editor = document.querySelector(".textarea_code");
    console.log('$editor: ',editor);
    ace.edit(editor, {
        // theme: "ace/theme/monokai",
        // mode: "ace/mode/javascript",
        mode: "ace/mode/apex",
    }); */
});
function setSessionText() {
    let a = baseUrl + '';
    console.log('$a: ', a);
    if (a.includes('sandbox')) {
        a = a.substring(0, a.indexOf('.sandbox.'));
        a = a.split('-');
        a = a[a.length - 1];
        console.log('$a: ', a);
    } else {
        a = a.split('-');
        a = a[0];
        a = a.replaceAll('https://', '');
        console.log('$a: ', a);
    }

    a = a.toUpperCase();
    console.log('$environment: ', a);
    document.title = document.title + ' - ' + a;
}
function showDiv(element) {
    $('.' + element).removeClass('hide');
}
function hideDiv(element) {
    $('.' + element).addClass('hide');
}

async function getObjectSchemaByName(sObjectName) {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    try {
        const response = await fetch(baseUrl + '/services/data/v59.0/sobjects/' + sObjectName + '/describe', requestOptions);
        if (!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        /* let res = JSON.parse(result);
        let schemaMap = new Map();
        res.fields.forEach(val => {
            schemaMap.set(val.name, val);
        }); */
        return { isError: false, data: result };
    } catch (error) {
        return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}

async function getRecordDetailById(sObjectName, recId) {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    try {
        const response = await fetch(baseUrl + '/services/data/v59.0/sobjects/' + sObjectName + '/' + recId, requestOptions);
        if (!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result };
    } catch (error) {
        return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}
$(document).on('click', '.sObjectToApex', function (e) {
    onsObjectToApexClick(false);
    $('.eye_icon').removeClass("fa-square-o").addClass("fa-minus-square-o");
});

$(document).on('click', '.eye_icon', function (e) {
    toggleEyeButton(true);
});
function toggleEyeButton(performAction) {
    let icon = $('.eye_icon');
    if (icon.hasClass("fa-minus-square-o")) {
        icon.removeClass("fa-minus-square-o").addClass("fa-square-o");
        if (performAction)
            onsObjectToApexClick(true);
    } else if (icon.hasClass("fa-square-o")) {
        icon.removeClass("fa-square-o").addClass("fa-minus-square-o");
        if (performAction)
            onsObjectToApexClick(false);
    }
}
async function onsObjectToApexClick(showParents) {
    console.log('$objectName: ', objectName);
    console.log('$originalRecord: ', originalRecord);
    console.log('$recordsData: ', recordsData);
    console.log('$originalObjectDescribe: ', originalObjectDescribe);
    console.log('$fieldApiNameAndFieldDataMap: ', fieldApiNameAndFieldDataMap);
    console.log('$keyPrefixAndObjectNameMap: ', keyPrefixAndObjectNameMap);

    let parentIdMap = new Map();
    if (originalRecord && showParents) {
        if (originalObjectDescribe) {
            originalObjectDescribe.fields.forEach((element) => {
                if ((!element.nillable && !element.defaultedOnCreate && element.updateable && element.createable) || (element.updateable && element.name !== "OwnerId")) {
                    if (originalRecord.hasOwnProperty(element.name) && (originalRecord[element.name] || originalRecord[element.name] == 0)) {
                        if (element.relationshipName) {
                            let parentId = originalRecord[element.name];
                            let parent = keyPrefixAndObjectNameMap.get(parentId.substring(0, 3));
                            parentIdMap.set(parentId, { parentName: parent, parentField: element.name });
                        }
                    }
                }
            });
        }
    }
    console.log('$parentIdMap: ', parentIdMap);

    let completeApex = '';

    let parentObjAndApexMap = new Map();
    let parentIDAndNameMap = new Map();
    const promises = Array.from(parentIdMap.entries()).map(async ([key, value]) => {
        let schemaRESPONSE = await getObjectSchemaByName(value.parentName);
        console.log('$schemaRESPONSE: ', schemaRESPONSE);
        let recordRESPONSE = await getRecordDetailById(value.parentName, key);
        console.log('$recordRESPONSE: ', recordRESPONSE);
        let sObjectName = keyPrefixAndObjectNameMap.get(key.substring(0, 3));
        let sToApexData = getJSONToApex(schemaRESPONSE.data, recordRESPONSE.data, sObjectName, null);
        console.log('$sToApexData: ', sToApexData);
        completeApex += sToApexData + '\n\n';
        parentObjAndApexMap.set(sObjectName, sToApexData);
        parentIDAndNameMap.set(key, sObjectName.replace(/__c/g, "").toLowerCase() + 'Obj');
    });
    console.log('$parentIDAndNameMap: ', parentIDAndNameMap);
    await Promise.all(promises);

    if (originalRecord) {
        if (originalObjectDescribe) {
            let sObjectName = keyPrefixAndObjectNameMap.get(originalRecord.Id.substring(0, 3));
            let sToApexData = getJSONToApex(originalObjectDescribe, originalRecord, sObjectName, parentIDAndNameMap);
            // console.log('$sToApexData: ',sToApexData);
            completeApex += sToApexData + '\n\n';
            // console.log('$parentObjAndApexMap: ',parentObjAndApexMap);
            showDiv('small_popup_4');
            $('.r-box-outer').addClass('blur_4');
            $('.small_popup_4_box_heading_div').text('New ' + objectName);
            editor = ace.edit(document.querySelector("#editor"));
            editor.setOptions({
                // theme: "ace/theme/cobalt",
                // theme: "ace/theme/monokai",
                // theme: "ace/theme/one_dark",
                // theme: "ace/theme/textmate",
                // theme: "ace/theme/xcode",
                mode: "ace/mode/javascript",
                // mode: "ace/mode/apex"
            });
            /* ace.config.loadModule('ace/ext/language_tools', function () {
                editor.setOptions({
                  enableBasicAutocompletion: true,
                  enableSnippets: true,
                  enableLiveAutocompletion: true,
                });
              }); */
            editor.getSession().setValue(completeApex);
        }
    }
}


function getJSONToApex(objectDescribed, recordData, sObjectName, parentIDAndNameMap) {
    if (recordData) {
        if (objectDescribed) {
            let objName = sObjectName.replace(/__c/g, "").toLowerCase();
            let sToApexData = sObjectName + ' ' + objName + 'Obj = new ' + sObjectName + '(\n\t';
            let isFirstElement = true;
            objectDescribed.fields.forEach((element) => {
                if ((!element.nillable && !element.defaultedOnCreate && element.updateable && element.createable) || (element.updateable && element.name !== "OwnerId")) {
                    if (recordData.hasOwnProperty(element.name) && (recordData[element.name] || recordData[element.name] == 0)) {
                        if (isFirstElement) {
                            if (typeof recordData[element.name] == 'string') {
                                if (parentIDAndNameMap && parentIDAndNameMap.get(recordData[element.name])) {
                                    sToApexData += `${element.name} = ${parentIDAndNameMap.get(recordData[element.name])}.Id`;
                                } else {
                                    sToApexData += `${element.name} = '${recordData[element.name].replace(/'/g, "\\'").replace(/’/g, "\\'")}'`;
                                }
                            } else {
                                if (parentIDAndNameMap && parentIDAndNameMap.get(recordData[element.name])) {
                                    sToApexData += `${element.name} = ${parentIDAndNameMap.get(recordData[element.name])}.Id`;
                                } else {
                                    sToApexData += `${element.name} = ${recordData[element.name]}`;
                                }
                            }
                            isFirstElement = false;
                        } else {
                            if (typeof recordData[element.name] == 'string') {
                                if (parentIDAndNameMap && parentIDAndNameMap.get(recordData[element.name])) {
                                    sToApexData += `,\n\t${element.name} = ${parentIDAndNameMap.get(recordData[element.name])}.Id`;
                                } else {
                                    sToApexData += `,\n\t${element.name} = '${recordData[element.name].replace(/'/g, "\\'").replace(/’/g, "\\'")}'`;
                                }
                            } else {
                                if (parentIDAndNameMap && parentIDAndNameMap.get(recordData[element.name])) {
                                    sToApexData += `,\n\t${element.name} = ${parentIDAndNameMap.get(recordData[element.name])}.Id`;
                                } else {
                                    sToApexData += `,\n\t${element.name} = ${recordData[element.name]}`;
                                }
                            }
                        }
                    }
                }
            });
            sToApexData += ');\n insert ' + objName + 'Obj;';
            return sToApexData;
        }
    }
}

$(document).on('click', '.close-icon_4', function (e) {
    hideDiv('small_popup_4');
    $('.r-box-outer').removeClass('blur_4');
});

$(document).on('click', '.copy-icon_4', function (e) {
    let text = editor.getSession().getValue();
    navigator.clipboard.writeText(text).then(function () {
        $('.snackbar').text('Copied.');
        showToast();
    }, function (err) {
        console.error('error copying');
    });
});

let mapQueryableSobjectsMap;
function getObjects() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    fetch(baseUrl + "/services/data/v59.0/sobjects/", requestOptions).then(response => response.text()).then(result => {
        // console.log('$getObjects: ', result)
        let objectDescribeResponse = JSON.parse(result);
        keyPrefixAndObjectNameMap = new Map();
        mapQueryableSobjectsMap = new Map();
        console.log('$objectDescribeResponse: ', objectDescribeResponse);
        objectDescribeResponse.sobjects.forEach(val => {
            if (val.associateEntityType || !val.keyPrefix) {
                return;
            }
            if (val.queryable && val.createable && val.layoutable)
                mapQueryableSobjectsMap.set(val.name, val);
            keyPrefixAndObjectNameMap.set(val.keyPrefix, val.name);
        });
        console.log('$mapQueryableSobjectsMap: ', mapQueryableSobjectsMap);
        console.log('$keyPrefixAndObjectNameMap: ', keyPrefixAndObjectNameMap);
        $('.inp-search-1').removeAttr('disabled');
        hideSpinner();
        if (defaulRecordId) {
            fetchRecodDetails(defaulRecordId);
        }
    }).catch(error => {
        console.log('$getObjects: error', error)
    });
}

function updateRecordAtServer(fieldValuesJSON) {
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'PATCH',
        headers: myHeaders,
        body: fieldValuesJSON,
        redirect: 'follow'
    };

    fetch(baseUrl + '/services/data/v59.0/sobjects/' + objectName + '/' + currentRecordId, requestOptions).then(response => response.text()).then(result => {
        console.log('$API: ', result)
        if (!result) {
            $('.snackbar').text('Success!');
            showToast();
            fetchRecodDetails(currentRecordId);
        } else {
            let res = JSON.parse(result);
            console.log('$res: ', res);
            showDiv('small_popup_2');
            $('.r-box-outer').addClass('blur-2');
            $('.small_popup_2_input_box').text(res[0]?.message);
            $('.errcode').text(res[0]?.errorCode);
        }
        hideSpinner2();
    }).catch(error => {
        console.log('$getObjects: error', error)
    });
}


$(document).on('change', "#custom_checkbox", function (e) {
    let checked = $("#custom_checkbox").prop('checked');
    if (checked) {
        generateLayout(null, true);
    } else {
        generateLayout(null);
    }
});
let headClicked = false;
$(document).on('click', '.recodid-span', function (e) {
    headClicked = !headClicked;
    generateLayout(null, null, headClicked);
});
$(document).on('contextmenu', '.recodid-span', function (e) {
    e.preventDefault();
    copyToCLipboard(objectName);
});
$(document).on('click', '.recID-div', function (e) {
    showDiv('small_popup_3');
    let options = '<option value="--None--">--None--</option>';
    for (let [key, value] of childRelationshipMap) {
        options += '<option value="' + key + '">' + key + '</option>';
    }
    $('.childrelations').html(options);
    $(".childrelations").removeAttr('disabled');
});
$(document).on('change', '.childrelations', function (e) {
    let val = $(this).val().trim();
    if (val != '--None--') {
        $('.small_popup_3_box_middle_div').addClass('blur');
        let objValue = childRelationshipMap.get(val);
        let objectDetail = mapQueryableSobjectsMap.get(val);
        let extraFields = [];
        if (objValue.childSObject == 'OrderItem') {
            extraFields = [...extraFields, ...['Quantity', 'UnitPrice']];
        } else if (objValue.childSObject == 'CartItem') {
            extraFields = [...extraFields, ...['Name', 'Sku', 'UnitAdjustedPrice', 'Quantity', 'TotalAmount']];
        } else if (objValue.childSObject == 'Order') {
            extraFields = [...extraFields, ...['OrderReferenceNumber', 'Status']];
        }
        let let_extraFields = ',';
        if (extraFields.length) {
            let_extraFields = ',' + extraFields.join(',') + ',';
        }
        let fieldsArray = ['Id', ...extraFields, objValue.field];
        let query = 'SELECT Id' + let_extraFields + '' + objValue.field + ',CreatedDate FROM ' + objValue.childSObject + ' WHERE ' + objValue.field + ' = \'' + currentRecordId + '\' Order By CreatedDate DESC';


        const endpoint = baseUrl + '/services/Soap/c/59.0';

        const soapRequest = `<?xml version="1.0" encoding="utf-8" ?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:enterprise.soap.sforce.com">
            <soapenv:Header>
                <urn:SessionHeader>
                <urn:sessionId>${sessionId}</urn:sessionId>
                </urn:SessionHeader>
            </soapenv:Header>
            <soapenv:Body>
                <urn:query>
                <urn:queryString>${query}</urn:queryString>
                </urn:query>
            </soapenv:Body>
            </soapenv:Envelope>`;

        const headers = new Headers();
        headers.append('Content-Type', 'text/xml');
        headers.append('SOAPAction', 'urn:enterprise.soap.sforce.com/query');

        const requestOptions = {
            method: 'POST',
            headers: headers,
            body: soapRequest,
        };
        fetch(endpoint, requestOptions).then(response => response.text()).then(recs => {
            console.log('$API: ', recs)
            let xmlResponse = recs;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");
            let records = [];
            let recordNodes = xmlDoc.querySelectorAll('records');
            recordNodes.forEach(recordNode => {
                let rec = {};
                fieldsArray.forEach(val => {
                    rec[val] = recordNode.querySelector(val)?.textContent ? recordNode.querySelector(val)?.textContent : '';
                });
                records.push(rec);
            });

            let spb3_tbody = `<tr class="spb3_tr spb3_tbody_tr">
                <td class="spb3_td"></td>
                <td class="spb3_td"></td>
                <td class="spb3_td"></td>
            </tr>`;
            let spb3_thead_tr = '<th class="spb3_th">SN.</th><th class="spb3_th">Id</th><th class="spb3_th">Name</th><th class="spb3_th">Parent</th>';
            if (records?.length) {
                spb3_thead_tr = '<th class="spb3_th">SN.</th><th class="spb3_th">Id</th>';
                extraFields.forEach(f => {
                    spb3_thead_tr += '<th class="spb3_th">' + f + '</th>';
                });
                spb3_thead_tr += '<th class="spb3_th">' + objValue.field + '</th>';
                spb3_tbody = '';
                records.forEach((rec, index) => {
                    let indx = index + 1;
                    let parentValue = rec[objValue.field];
                    let extraTds = '';
                    extraFields.forEach(f => {
                        let v = rec[f];
                        extraTds += `<td class="spb3_td">${v}</td>`;
                    });
                    spb3_tbody += `<tr class="spb3_tr spb3_tbody_tr">
                        <td class="spb3_td recId" data-recId="${rec.Id}">${indx}</td>
                        <td class="spb3_td recId" data-recId="${rec.Id}">${rec.Id}</td>
                        ${extraTds}
                        <td class="spb3_td parentId" data-parentId="${parentValue}">${parentValue}</td>
                    </tr>`;
                });
            }

            $('.spb3_thead_tr').html(spb3_thead_tr);
            $('.spb3_tbody').html(spb3_tbody);
            $('.small_popup_3_box_middle_div').removeClass('blur');
        }).catch(error => {
            console.log('$getObjects: error', error)
        });
    } else {
        let spb3_tbody = `<tr class="spb3_tr spb3_tbody_tr">
            <td class="spb3_td"></td>
            <td class="spb3_td"></td>
            <td class="spb3_td"></td>
        </tr>`;
        let spb3_thead_tr = '<th class="spb3_th">Id</th><th class="spb3_th">Name</th><th class="spb3_th">Parent</th>';
        $('.spb3_thead_tr').html(spb3_thead_tr);
        $('.spb3_tbody').html(spb3_tbody);
    }
});

$(document).on('click', '.spb3_th', function (e) {
    let text = $(this).text().trim();
    copyToCLipboard(text);
});

$(document).on('click', '.spb3_td', function (e) {
    let recId = $(this).attr('data-recId');
    let parentId = $(this).attr('data-parentId');

    $('.childrelations').prop('disabled', 'true');
    let currentId = recId ? recId : parentId;
    if (currentId) {
        $('.inp-search-1').val(currentId);
        fetchRecodDetails(currentId);
    } else {
        let text = $(this).text().trim();
        copyToCLipboard(text);
    }
});
$(document).on('contextmenu', '.recID-div', function (e) {
    e.preventDefault();
});

$(document).on('click', '.field', function (e) {
    let text = $(this).text().trim();
    copyToCLipboard(text);
});
$(document).on('click', '.value', function (e) {
    let text = $(this).text().trim();
    copyToCLipboard(text);
});

$(document).on('contextmenu', '.value', function (e) {
    e.preventDefault();
    let text = $(this).text().trim();
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    const valid = userKeyRegExp.test(text);
    if (valid) {
        $('.inp-search-1').val(text);
        fetchRecodDetails(text);
    }
});
$(document).on('contextmenu', '.field', function (e) {
    e.preventDefault();
    currentFieldApiName = $(this).text().trim();
    let field = recordsData.find(dt => {
        return dt.field == currentFieldApiName;
    });
    currentValue = field.value;
    let fieldDetail = fieldApiNameAndFieldDataMap.get(currentFieldApiName);
    if (!fieldDetail.createable) {
        $('.snackbar').text('Readonly Field.');
        showToast();
        return;
    }

    let picklistValues;
    fieldType = fieldDetail.type;
    if (fieldType == 'picklist' || fieldType == 'multipicklist') {
        picklistValues = [...fieldDetail.picklistValues];
        let options = '';
        picklistValues.forEach(val => {
            let selected = val.value == currentValue ? 'selected' : '';
            options += `val<option class="picklist_option ${val.value}" value="${val.value}" ${selected}>${val.label}</option>`;
        });
        generateTagsAndShowPopup('<select class="picklist">' + options + '</select>');

    } else if (fieldType == 'string' || fieldType == 'url' || fieldType == 'reference' || fieldType == 'phone' || fieldType == 'email' || fieldType == 'date' || fieldType == 'datetime') {
        generateTagsAndShowPopup('<input class="small_popup_input_box" placeholder="Enter Value" value="' + currentValue + '" />');
    } else if (fieldType == 'boolean') {
        let checked = currentValue ? 'checked="true"' : '';
        let select = `
            <div class="center-v-2">
                <input type="checkbox" id="custom_checkbox_value" class="input-check" ${checked}/>
                <label for="custom_checkbox_value" class="chk_label noselect">${currentFieldApiName}</label>
            </div>
        `;
        generateTagsAndShowPopup(select);
    } else if (fieldType == 'double' || fieldType == 'currency' || fieldType == 'percent' || fieldType == 'int') {
        generateTagsAndShowPopup('<input class="small_popup_input_box" placeholder="Enter Value" value="' + currentValue + '" type="number" />');
    } else if (fieldType == 'textarea') {
        generateTagsAndShowPopup('<textarea class="textarea" placeholder="Enter Value">' + currentValue + '</textarea>');
    }

});

function generateTagsAndShowPopup(code) {
    $('.small_popup_box_heading_div').text(currentFieldApiName);
    showDiv('small_popup');
    $('.r-box-outer').addClass('blur');
    $('.small_popup_box_middle_div').html(code);
}

$(document).on('click', '.small_popup_btn2', function (e) {
    if (fieldType == 'picklist' || fieldType == 'multipicklist') {
        currentValue = $('.picklist').val().trim();
    } else if (fieldType == 'string' || fieldType == 'url' || fieldType == 'reference' || fieldType == 'phone' || fieldType == 'email' || fieldType == 'date' || fieldType == 'datetime') {
        currentValue = $('.small_popup_input_box').val().trim();
    } else if (fieldType == 'boolean') {
        currentValue = $("#custom_checkbox_value").prop('checked');
    } else if (fieldType == 'double' || fieldType == 'currency' || fieldType == 'percent' || fieldType == 'int') {
        currentValue = parseFloat($('.small_popup_input_box').val());
    } else if (fieldType == 'textarea') {
        currentValue = $('.textarea').val();
    }
    let jsonObject = {};
    jsonObject[currentFieldApiName] = currentValue;
    updateRecordAtServer(JSON.stringify(jsonObject));
    hideDiv('small_popup');
    $('.r-box-outer').removeClass('blur');
    showSpinner2();
});

$(document).on('click', '.close-icon', function (e) {
    hideDiv('small_popup');
    $('.r-box-outer').removeClass('blur');
});
$(document).on('click', '.close-icon-2', function (e) {
    hideDiv('small_popup_2');
    $('.r-box-outer').removeClass('blur-2');
});
$(document).on('click', '.close-icon_3', function (e) {
    hideDiv('small_popup_3');
});
$(document).on('click', '.small_popup_btn1', function (e) {
    hideDiv('small_popup');
    $('.r-box-outer').removeClass('blur');
});

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
function copyToCLipboard(value) {
    let text = value;
    navigator.clipboard.writeText(text).then(function () {
        $('.snackbar').text(text);
        showToast();
    }, function (err) {
        console.error('error copying');
    });
}

$(document).on('input', '.inp-search-2', function (e) {
    let val = $(this).val().trim();
    generateLayout(val);
});

$(document).on('keydown', '.inp-search-1', function (e) {
    let charCode = (event.which) ? event.which : event.keyCode;
    if (charCode == 13) {
        let recordId = $(this).val().trim();
        currentRecordId = recordId;
        const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
        const valid = userKeyRegExp.test(recordId);
        if (valid) {
            fetchRecodDetails(recordId);
        } else {
            $('.snackbar').text('Eneter valid record Id');
            showToast();
        }
    }
});
$(document).on('input', '.inp-search-1', function (e) {
    let val = $(this).val().trim();
    if (val) {
        const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
        const valid = userKeyRegExp.test(val);
        if (!valid) {
            let query;
            if (val.includes('-')) {
                query = 'SELECT+Id,Name,StockKeepingUnit,CreatedDate+FROM+Product2+WHERE+StockKeepingUnit+=+\'' + val + '\'+Order+By+CreatedDate+DESC';
            } else {
                query = 'SELECT+Id,OrderReferenceNumber,CreatedDate+FROM+Order+WHERE+OrderReferenceNumber+=+\'' + val + '\'+Order+By+CreatedDate+DESC';
            }

            var myHeaders = new Headers();
            myHeaders.append("Authorization", "Bearer " + sessionId);

            var requestOptions = {
                method: 'GET',
                headers: myHeaders,
                redirect: 'follow'
            };

            fetch(baseUrl + '/services/data/v42.0/query/?q=' + query, requestOptions).then(response => response.text()).then(result => {
                console.log('$API: ', result)
                let res = JSON.parse(result);
                console.log('$res: ', res);
                if (!res?.records?.length) {
                    $('.snackbar').text('Records [0]');
                    showToast();
                    return;
                }
                if (res?.records[0]) {
                    $('.inp-search-1').val(res?.records[0]?.Id);
                }
                if (res?.records[1]) {
                    console.log('%c ' + res?.records[1]?.Id, 'color: green;');
                    copyToCLipboard(res?.records[1]?.Id);
                }
            }).catch(error => {
                console.log('$getObjects: error', error)
            });
        }
    }
});

function fetchRecodDetails(recordId) {

    let dot;
    let i = 0;
    let label;
    let interval = setInterval(() => {
        dot = i == 0 ? '' : i == 1 ? '.' : i == 2 ? '..' : i == 3 ? '...' : i == 4 ? '....' : '';
        i = i == 5 ? 0 : i;
        label = 'Loading' + dot;
        $('.recID-div').text(label);
        i = i + 1;
    }, 100);
    showSpinner2();
    objectName = keyPrefixAndObjectNameMap.get(recordId.substring(0, 3));
    currentRecordId = recordId;
    getObjectSchema();

    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    fetch(baseUrl + '/services/data/v59.0/sobjects/' + objectName + '/' + recordId, requestOptions).then(response => response.text()).then(result => {
        console.log('$API: ', result)
        clearInterval(interval);
        hideSpinner2();
        $('.inp-search-1').blur();
        $('.recID-div').text(recordId);
        let record = JSON.parse(result);
        originalRecord = JSON.parse(result);
        recordJSON = JSON.stringify(record);
        if (record && record[0] && record[0].errorCode) {
            $('.snackbar').text(record[0].message);
            showToast();
            return;
        }
        recordsData = [];
        Object.keys(record).forEach(v => {
            if (typeof record[v] == 'object' && record[v]) {
                return;
            }
            recordsData.push({
                field: v, value: record[v] != false && !record[v] ? '' : record[v]
            });
        });
        $("#custom_checkbox").removeAttr('disabled');
        $('.inp-search-2').removeAttr('disabled');
        $('.recodid-span').text(objectName + ' ID');
        generateLayout(null);
    }).catch(error => {
        console.log('$getObjects: error', error)
    });
}

function generateLayout(searchText, hideNulls, showNullsOnly) {
    hideNulls = $("#custom_checkbox").prop('checked');
    searchText = $('.inp-search-2').val().trim();
    let rows = '';
    recordsData.forEach(dataValue => {
        if (showNullsOnly && (typeof dataValue.value === 'boolean' || dataValue.value)) {
            return;
        }
        if (searchText && !dataValue.field.toLowerCase().includes(searchText.toLowerCase())) {
            return;
        }
        if (hideNulls && typeof dataValue.value === 'string' && dataValue.value === '') {
            return;
        }
        rows += `
        <div class="r-box-2_c r-box-2_1">
            <div class="field">
                ${dataValue.field}
            </div>
            <div class="value">
                ${dataValue.value}
            </div>
        </div>`;
    });
    $('.r-box-2').html(rows);
}

function getObjectSchema() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    fetch(baseUrl + '/services/data/v59.0/sobjects/' + objectName + '/describe', requestOptions).then(response => response.text()).then(result => {
        console.log('$API: ', result)
        let res = JSON.parse(result);
        originalObjectDescribe = JSON.parse(result);
        console.log('$res: ', res);
        fieldApiNameAndFieldDataMap = new Map();
        res.fields.forEach(val => {
            fieldApiNameAndFieldDataMap.set(val.name, val);
        });
        childRelationshipMap = new Map();
        res.childRelationships.forEach(val => {
            if (mapQueryableSobjectsMap.has(val.childSObject)) {
                childRelationshipMap.set(val.childSObject, {
                    childSObject: val.childSObject,
                    field: val.field,
                    relationshipName: val.relationshipName
                });
            }
        });
        console.log('$childRelationshipMap: ', childRelationshipMap);
    }).catch(error => {
        console.log('$getObjects: error', error)
    });
}

function showSpinner() {
    showDiv('spinner-div');
}

function hideSpinner() {
    hideDiv('spinner-div');
}

function showSpinner2() {
    showDiv('spinner-div-2');
}

function hideSpinner2() {
    hideDiv('spinner-div-2');
}
