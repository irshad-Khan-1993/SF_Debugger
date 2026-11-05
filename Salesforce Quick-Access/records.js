let query;
let fields;
let editor;
let apiName;
let baseUrl;
let objectId;
let sessionId;
let queryFields;
let recordpopup;
let nameLabelMap;
let records = [];
let recordsAll = [];
let keyPrefixAndObjectMap;
let currentDescribedObject;
$(document).ready(function () {
    hideSpinner();
    Draggable.create('.small_popup_1');
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    apiName = url.searchParams.get('apiName');
    console.log('$apiName: ', apiName);
    objectId = url.searchParams.get('objectId');
    console.log('$objectId: ', objectId);
    getObjectFields();
});

$(document).on('click', '.execute-btn', function (e) {
    getInfoFromQuery();
    getObjectFields();
    $('.small_popup_1').addClass('hide');
    $('.outer').removeClass('blur');
});

$(document).on('change', '.fieldType', function (e){
    getInfoFromQuery();
    getObjectFields();
    $('.small_popup_1').addClass('hide');
    $('.outer').removeClass('blur');
});

$(document).on('click', '.edit-query', function (e) {
    $('.small_popup_1').removeClass('hide');
    $('.outer').addClass('blur');
});

function getInfoFromQuery() {
    let queryInput = $('.query-inp').val().trim();
    console.log('$queryInput: ', queryInput);
    query = queryInput;
    console.log('$query: ', query);
    console.log('$queryInput: ', queryInput);
    queryInput = queryInput.toUpperCase().split(' ');
    console.log('$queryInput: ', queryInput);
    let index = queryInput.findIndex(element => {
        return element == 'FROM';
    });
    console.log('$index: ', index);
    apiName = queryInput[index + 1];
    console.log('$apiName: ', apiName);
    resetApiName(query);
}

function resetApiName(q){
    console.log('Checkpoint resetApiName');
    q = q.split(' ');
    console.log('$q: ', q);
    let index = q.findIndex(element => {
        return element == 'FROM' || element == 'From' || element == 'from';
    });
    console.log('$index: ', index);
    apiName = q[index + 1];
    console.log('$apiName: ', apiName);
}

function getObjectFields() {
    showSpinner();
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    fetch(baseUrl + '/services/data/v59.0/sobjects/' + apiName + '/describe', requestOptions).then(response => response.json()).then(result => {
        console.log('$API: ', result);
        currentDescribedObject = result;
        fields = result;
        console.log('$parsed: ', fields);
        fields = fields.fields;
        console.log('$fields: ', fields);
        generateFieldsMap();
        if (!query)
            generateQuery();
        fetchRecordsXMLSOAP();
    }).catch(error => {
        console.log('$getObjects: error', error);
        $('.small_popup_2').removeClass('hide');
        $('.outer').addClass('blur-2');
        $('.errcode').text('MALFORMED_QUERY');
        $('.small_popup_2_input_box').text('Unexpected fault in query.');
        hideSpinner();
    });
}
function generateFieldsMap() {
    nameLabelMap = new Map();
    let selectedType = $('.fieldType').val();
    let count = 0;
    fields.forEach(val => {
        let canAdded = true;
        if(selectedType == 'EDITABLE'){
            if(!val.updateable && val.name != 'Id' && val.name != 'Name'){
                canAdded = false;
            }
        }
        if(selectedType == 'CUSTOM'){
            if(!val.custom && val.name != 'Id' && val.name != 'Name'){
                canAdded = false;
            }
        }
        if(selectedType == 'STANDARD'){
            if(val.custom && val.name != 'Id' && val.name != 'Name'){
                canAdded = false;
            }
        }
        if(selectedType == 'CREATABLE'){
            if(!val.createable && val.name != 'Id' && val.name != 'Name'){
                canAdded = false;
            }
        }
        if(selectedType == 'CALCULATED'){
            if(!val.calculated && val.name != 'Id' && val.name != 'Name'){
                canAdded = false;
            }
        }
        if(selectedType == 'NILLABLE'){
            if(!val.nillable && val.name != 'Id' && val.name != 'Name'){
                canAdded = false;
            }
        }
        if(selectedType == 'NOT NILLABLE'){
            if(val.nillable && val.name != 'Id' && val.name != 'Name'){
                canAdded = false;
            }
        }
        if(selectedType == 'EXTERNAL ID'){
            if(!val.externalId && val.name != 'Id' && val.name != 'Name'){
                canAdded = false;
            }
        }
        if (query) {
            if (query.toLowerCase().includes(val.name.toLowerCase())) {
                if(canAdded){
                    nameLabelMap.set(val.name, val);
                    count ++;
                }
            }
        } else {
            if(canAdded){
                nameLabelMap.set(val.name, val);
                count ++;
            }
        }
    });
    // $('.fields-count').text('CURRENT FIELDS [ ' + count + ' ]');
    console.log('$nameLabelMap: ', nameLabelMap);
}
function generateQuery() {
    query = 'Select ';
    for (const key of nameLabelMap.keys()) {
        query += key + ', ';
    }
    query = query.trim().slice(0, -1);
    if (nameLabelMap.has('CreatedDate')) {
        query += ' FROM ' + apiName + ' Order By CreatedDate DESC';
    } else {
        query += ' FROM ' + apiName;
    }
    query += ' LIMIT 100';
    console.log('$query: ', query);
    // query = 'Select Id, Name, Link__c, Order__c FROM Link__c Order By CreatedDate DESC LIMIT 5';
    $('.query-inp').val(query);
}
function fetchRecordsXMLSOAP() {
    const endpoint = baseUrl + "/services/Soap/c/59.0";
    const soapRequest =
        '<?xml version="1.0" encoding="utf-8" ?>' +
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:enterprise.soap.sforce.com">' +
        '  <soapenv:Header>' +
        '    <urn:SessionHeader>' +
        '      <urn:sessionId>' + sessionId + '</urn:sessionId>' +
        '    </urn:SessionHeader>' +
        '  </soapenv:Header>' +
        '  <soapenv:Body>' +
        '    <urn:query>' +
        '      <urn:queryString>' + query + '</urn:queryString>' +
        '    </urn:query>' +
        '  </soapenv:Body>' +
        '</soapenv:Envelope>';

    fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "text/xml",
            "SOAPAction": "urn:enterprise.soap.sforce.com/query",
        },
        body: soapRequest,
    }).then((response) => response.text()).then((recs) => {
        console.log('$query-FINAL: ', query);
        let xmlResponse = recs;
        console.log('$xmlResponse: ', xmlResponse);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");
        let exceptionCode = xmlDoc.querySelector('exceptionCode');
        let exceptionMessage = xmlDoc.querySelector('exceptionMessage');
        console.log('$exceptionCode: ', exceptionCode);
        console.log('$exceptionMessage: ', exceptionMessage);
        if (exceptionCode) {
            console.log('$exceptionCode: ', exceptionCode.textContent);
            console.log('$exceptionMessage: ', exceptionMessage.textContent);
            $('.small_popup_2').removeClass('hide');
            $('.outer').addClass('blur-2');
            $('.errcode').text(exceptionCode.textContent);
            $('.small_popup_2_input_box').text(exceptionMessage.textContent);
            hideSpinner();
        } else {
            prepareRecordsARRAY(xmlResponse);
            generateTableHeader();
            generateTable();
            generateFieldsDropDown();
        }
    }).catch((error) => {
        console.error("Error:", error);
    });

}
$(document).on('click', '.close-icon, .cancel-btn, .close-icon-2', function (e) {
    $('.outer').removeClass('blur');
    $('.small_popup_1').addClass('hide');
});
$(document).on('click', '.close-icon-2', function (e) {
    $('.small_popup_2').addClass('hide');
    $('.outer').removeClass('blur-2');
});
function showDiv(element) {
    $('.' + element).removeClass('hide');
}
function hideDiv(element) {
    $('.' + element).addClass('hide');
}
function generateFieldsDropDown() {
    let options = '';
    for (const key of nameLabelMap.keys()) {
        options += `<option class="${key}" value="${key}">${key}</option>`;
    }
    $('.fields_select').html(options);
}
function prepareRecordsARRAY(xmlResponse) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");
    records = [];
    recordsAll = [];
    let recordNodes = xmlDoc.querySelectorAll('records');
    recordNodes.forEach(recordNode => {
        let id = recordNode.querySelector('Id').textContent;
        let rec = {};
        for (const key of nameLabelMap.keys()) {
            rec[key] = recordNode.querySelector(key)?.textContent ? recordNode.querySelector(key)?.textContent : '';
        }
        records.push(rec);
    });
    console.log('$records: ', records);
    recordsAll = [...records];
    console.log('$recordsAll: ', recordsAll);
}

$(document).on('click', '.sObjectListToApex', function (e){
    onSObjectListToApexClick();
});

async function onSObjectListToApexClick(){
    console.log('$recordsAll: ', recordsAll);
    console.log('$currentDescribedObject: ', currentDescribedObject);
    
    let objName = apiName.replace(/__c/g, "").toLowerCase();
    let completeDetail = `List<${apiName}> ${objName}sList = new List<${apiName}>();\n\n`;
    const promises = recordsAll.map(async (value, index) => {
        let recordRESPONSE = await getRecordDetailById(value.Id);
        console.log('$recordRESPONSE: ',recordRESPONSE);
        let sToApexData = getJSONToApex(currentDescribedObject, recordRESPONSE.data, apiName, index);
        console.log(sToApexData);
        completeDetail += sToApexData;
        let newObj = objName + 'Obj'+(index + 1);
        completeDetail += `\n${objName}sList.add(${newObj});\n\n`;
        $('.sObjectListToApex').text('[-'+(index + 1)+'-]');
    });
    await Promise.all(promises);
    completeDetail += `insert ${objName}sList;\n`;
    completeDetail += `System.debug('${objName}sList: ' + ${objName}sList);`;
    console.log(completeDetail);
    /* showDiv('small_popup_4');
    $('.outer').addClass('blur');
    $('.small_popup_4_box_middle_div_code').val(completeDetail);
    $('.small_popup_4_box_heading_div').text('New ' + apiName + ' List [ ' + recordsAll.length + ' ]');
    $('.sObjectListToApex').text('GENERATE CODE'); */

    showDiv('small_popup_4');
    $('.outer').addClass('blur');
    $('.small_popup_4_box_heading_div').text('New ' + apiName + ' List [ ' + recordsAll.length + ' ]');
    editor = ace.edit(document.querySelector("#editor"));
    editor.setOptions({
        // theme: "ace/theme/cobalt",
        // theme: "ace/theme/monokai",
        // theme: "ace/theme/one_dark",
        // theme: "ace/theme/textmate",
        // theme: "ace/theme/xcode",
        // mode: "ace/mode/javascript",
        mode: "ace/mode/apex"
    });
    editor.getSession().setValue(completeDetail);
    $('.sObjectListToApex').text('GENERATE CODE');
}
$(document).on('click', '.close-icon_4', function (e) {
    hideDiv('small_popup_4');
    $('.outer').removeClass('blur');
});
$(document).on('click', '.copy-icon_4', function (e){
    let text = editor.getSession().getValue();
    navigator.clipboard.writeText(text).then(function () {
         $('.snackbar').text('Copied.');
         showToast();
     }, function (err) {
         console.error('error copying');
     });
 });
function getJSONToApex(objectDescribed, recordData, sObjectName, index){
    if (recordData) {
        if (objectDescribed) {
            index++;
            let objName = sObjectName.replace(/__c/g, "").toLowerCase();
            let sToApexData = sObjectName + ' ' + objName + 'Obj'+index+' = new ' + sObjectName + '(\n\t';
            let isFirstElement = true;
            objectDescribed.fields.forEach((element) => {
                if ((!element.nillable && !element.defaultedOnCreate && element.updateable && element.createable) || (element.updateable && element.name !== "OwnerId")) {
                    if (recordData.hasOwnProperty(element.name) && (recordData[element.name] || recordData[element.name] == 0)) {
                        if (isFirstElement) {
                            if (typeof recordData[element.name] == 'string') {
                                sToApexData += `${element.name} = '${recordData[element.name].replace(/'/g, "\\'").replace(/’/g, "\\'")}'`;
                            } else {
                                sToApexData += `${element.name} = ${recordData[element.name]}`;
                            }
                            isFirstElement = false;
                        } else {
                            if (typeof recordData[element.name] == 'string') {
                                sToApexData += `,\n\t${element.name} = '${recordData[element.name].replace(/'/g, "\\'").replace(/’/g, "\\'")}'`;
                            } else {
                                sToApexData += `,\n\t${element.name} = ${recordData[element.name]}`;
                            }
                        }
                    }
                }
            });
            sToApexData += ');';
            return sToApexData;
        }
    }
}

async function getRecordDetailById(recId) {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };
    
    try{
        const response = await fetch(baseUrl + '/services/data/v59.0/sobjects/' + apiName + '/' + recId, requestOptions);
        if(!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result};
    }catch(error){
       return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}

$(document).on('input', '.inp-search', function (e) {
    let val = $(this).val().trim();
    console.log('val: ', val);
    let selected = $('.fields_select').val();
    console.log('$selected: ', selected);
    records = recordsAll.filter(element => {
        return element[selected].toLowerCase().includes(val.toLowerCase());
    });
    console.log('$records: ', records);
    generateTable();
});
function generateTableHeader() {
    let ths = '';
    for (const key of nameLabelMap.keys()) {
        ths += `<th class="th th_field" data-id="${key}">${key} <i class="fa fa-angle-down fa-lg" aria-hidden="true"></i></th>`;
    }
    $('.tr_h').html(ths);
}
function generateTable() {
    $('.tbody').html('');
    let rows = '';
    records.forEach(val => {
        let row = '';
        Object.keys(val).forEach(rec => {
            row += `<td title="${rec}" class="td td-data td-attr type-${rec}" data-apiName="${rec}" data-label="${rec}">${val[rec]}</td>`;
        });
        rows += `<tr class="tr">${row}</tr>`;
    });

    $('.tbody').html(rows);
    $('.btn-records').text(apiName + '  [ ' + records.length + ' ]');
    hideSpinner();
}

$(document).on('click', '.th_field', function (e) {
    let th = $(this).attr('data-id');
    console.log('$th: ', th);
    var icon = $(this).find("i");
    console.log('$icon: ', icon);
    if (icon.hasClass("fa-angle-down")) {
        icon.removeClass("fa-angle-down").addClass("fa-angle-up");
        sortRecords(th, 'Asc');
    } else if (icon.hasClass("fa-angle-up")) {
        icon.removeClass("fa-angle-up").addClass("fa-angle-down");
        sortRecords(th, 'Desc');
    }
});

$(document).on('click', '.td-data', function (e) {
    let fieldName = $(this).attr('data-apiName');
    console.log('$fieldName: ', fieldName);
    let text = $(this).text().trim();
    console.log('$text: ', text);
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    const valid = userKeyRegExp.test(text);
    if (valid) {
        copyToCLipboard(text);
    } else {
        copyToCLipboard(fieldName);
    }
});

function sortRecords(th, order) {
    let thField = nameLabelMap.get(th);
    console.log('$thField: ', thField.type);
    console.log('$order: ', order);
    if (thField.type == 'currency' || thField.type == 'double' || thField.type == 'number' || thField.type == 'decimal') {
        if (order == 'Asc') {
            records.sort((a, b) => {
                return parseFloat(a[th]) - parseFloat(b[th]);
            });
        } else {
            records.sort((b, a) => {
                return parseFloat(a[th]) - parseFloat(b[th]);
            });
        }
    } else if (thField.type == 'datetime' || thField.type == 'date') {
        if (order == 'Asc') {
            records.sort((a, b) => {
                const dateA = new Date(a[th]);
                const dateB = new Date(b[th]);
                return dateB - dateA;
            });
        } else {
            records.sort((a, b) => {
                const dateA = new Date(a[th]);
                const dateB = new Date(b[th]);
                return dateA - dateB;
            });
        }
    } else {
        if (order == 'Asc') {
            records.sort((a, b) => {
                return a[th].localeCompare(b[th]);
            });
        } else {
            records.sort((b, a) => {
                return a[th].localeCompare(b[th]);
            });
        }
    }

    generateTable();
}

$(document).on('contextmenu', '.td-data', function (e) {
    e.preventDefault();
    let text = $(this).text().trim();
    copyToCLipboard(text);
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    const valid = userKeyRegExp.test(text);
    console.log(valid);
    if (valid) {
        let recordID = 'recordID=' + text + '&';
        openMaximized('record.html?' + recordID + 'baseUrl=' + baseUrl + '&sessionId=' + sessionId);
    }
});
function openMaximized(url) {
    if (url) {
        chrome.windows.create({
            type: 'popup',
            url: url,
            state: 'maximized'
        });
    }
}

function getFormattedDate(dataString) {
    try {
        let date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(dataString));
        date_time = date_time.replaceAll(',', '').toUpperCase().split(' ').join(' ');
        return date_time;
    } catch (error) {
        return '';
    }
}

$(document).on('click', '.sb-top', function (e) {
    showHidePopup();
});

function showHidePopup() {
    $(".popup-fixed").fadeIn();
    $('.popup-fixed').toggleClass('hide');
    $('.outer').toggleClass('blur');
}

function showSpinner() {
    $(".spinner-div").show();
}

function hideSpinner() {
    $(".spinner-div").hide();
}

function copyToCLipboard(value) {
    let text = value;
    navigator.clipboard.writeText(text).then(function () {
        console.log('copied : ' + text);
        $('.snackbar').text(text);
        showToast();
    }, function (err) {
        console.error('error copying');
    });
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