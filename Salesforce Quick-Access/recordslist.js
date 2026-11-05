let editor;
let apiName;
let baseUrl = null;
let sessionId = null;
let logsIdArray = null;
let userRecords = null;
let sobjectsAll = null;
let fieldsAll = null;
let recordsAll = null;
let currentDescribedObject = null;
$(document).ready(function () {
    $(".spinner-div").hide();
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    setDivWidth();
    setDivWidthFields();
    getObjects();
});

async function getObjects() {
    let apiResponse = await getObjectsFromServer();
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$data: ', data);
    if (data) {
        sobjectsAll = [...data.sobjects];
        generateSobjectDropdowns(null);

    }
}

function getFilteredSobjectList(searchTerm) {
    let list = [];
    sobjectsAll.forEach(val => {
        if (val.associateEntityType || !val.keyPrefix) {
            return;
        }
        // if (val.queryable && val.createable && val.layoutable) {
            if (searchTerm && !val.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                return;
            } else {
                list.push(val.name);
            }
        // }
    });
    return list;
}

function generateSobjectDropdowns(searchTerm) {
    let list = getFilteredSobjectList(searchTerm);
    liTags = '';
    list.forEach(val => {
        liTags += `<li class="d_li d_li_sobjects">${val}</li>`;
    });
    $('.d_ul_sobjects').html(liTags);
}

$(document).on('focus', '.dropdown_inp_sobjects', function (e) {
    $('.dropdown_contents_sobjects').removeClass('hide');
    $('.dropdown_contents_fields').addClass('hide');
    let searchTerm = $(this).val().trim();
    generateSobjectDropdowns(searchTerm);
});

$(document).on('blur', '.dropdown_inp_sobjects', function (e) {
    let searchTerm = $(this).val().trim();
    if (searchTerm) {
        let list = getFilteredSobjectList(searchTerm);
        if (list.length == 1 && list[0] == searchTerm) {
            $('.dropdown_contents_sobjects').addClass('hide');
        }
    }
});


$(document).on('input', '.dropdown_inp_sobjects', function (e) {
    let searchTerm = $(this).val().trim();
    generateSobjectDropdowns(searchTerm);
});

$(document).on('click', '.d_li_sobjects', function (e) {
    let text = $(this).text().trim();
    console.log('$text: ', text);
    $('.dropdown_inp_sobjects').val(text);
    $('.dropdown_inp_fields').val('');
    $('.dropdown_contents_sobjects').addClass('hide');
    $('.dropdown_inp_fields').removeAttr('disabled');
    $('.top_select_filter').val('--NONE--');
    $('.inp_value').val('');
    apiName = text;
    console.log('$apiName: ', apiName);
    getFields(text);
});

function setDivWidth() {
    var inputWidth = $('.dropdown_inp_sobjects').width();
    $('.dropdown_contents_sobjects').width(inputWidth + 4);
}

function showSpinner() {
    $(".spinner-div").show();
}

function hideSpinner() {
    $(".spinner-div").hide();
}

function checkResponse(apiResponse) {
    if (apiResponse.isError) {
        hideSpinner();
        $('.snackbar').text(apiResponse.message);
        showToast();
        return null;
    } else {
        return apiResponse.data;
    }
}

async function getObjectsFromServer() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    try {
        const response = await fetch(baseUrl + '/services/data/v59.0/sobjects/', requestOptions);
        if (!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result };
    } catch (error) {
        return { isError: true, name: error.name, message: error.message, stack: error.stack };
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

function setDivWidthFields() {
    var inputWidth = $('.dropdown_inp_fields').width();
    $('.dropdown_contents_fields').width(inputWidth + 4);
}

$(document).on('focus', '.dropdown_inp_fields', function (e) {
    $('.dropdown_contents_fields').removeClass('hide');
    $('.dropdown_contents_sobjects').addClass('hide');
    let searchTerm = $(this).val().trim();
    generateFieldsDropdowns(searchTerm);
});

$(document).on('blur', '.dropdown_inp_fields', function (e) {
    let searchTerm = $(this).val().trim();
    if (searchTerm) {
        let list = getFilteredFieldsList(searchTerm);
        if (list.length == 1 && list[0] == searchTerm) {
            $('.dropdown_contents_fields').addClass('hide');
        }
    }
});

$(document).on('input', '.dropdown_inp_fields', function (e) {
    let searchTerm = $(this).val().trim();
    generateFieldsDropdowns(searchTerm);
});

$(document).on('click', '.d_li_fields', function (e) {
    let text = $(this).text().trim();
    console.log('$text: ', text);
    $('.dropdown_inp_fields').val(text);
    $('.dropdown_contents_fields').addClass('hide');
    if($('.top_select_filter').val() == '--NONE--'){
        $('.top_select_filter').val('INCLUDES');
    }
    handleSelectedField(text);
});

function handleSelectedField(field) {
    field = fieldsAll.find(f => {
        return f.name == field;
    });
    console.log('$field: ', field);
    if (field.type == 'picklist' || field.type == 'multipicklist') {
        let picklistDropdown = '';
        field.picklistValues.forEach(val => {
            if (val.active) {
                picklistDropdown += `<option value="${val.value}">${val.label}</option>`;
            }
        });
        $('.top_values_dv').html(`<select class="cta select top_select top_select_values">${picklistDropdown}</select>`);
        $('.top_select_filter').val('EQUALS');
    }else if (field.type == 'boolean') {
        let picklistDropdown = '<option value="true">true</option><option value="false">false</option>';
        $('.top_values_dv').html(`<select class="cta select top_select top_select_values">${picklistDropdown}</select>`);
        $('.top_select_filter').val('EQUALS');
    }else {
        $('.top_values_dv').html('<input class="cta inp inp_value" placeholder="VALUE"/>');
    }
}

$(document).on('click', '.top_getrecords_btn', function (e) {
    // let fieldsArray = ['Id', 'FirstName', 'LastName', 'Email', 'Phone'];
    // getRecords('Select Id, FirstName, LastName, Email, Phone From Contact', fieldsArray);
    let text = $(this).text().trim();
    console.log('$text: ', text);

    let selectedObject = $('.dropdown_inp_sobjects').val();
    let selectedField = $('.dropdown_inp_fields').val();
    let selectedFilter = $('.top_select_filter').val();
    let selectedInpValue = $('.inp_value').val();
    let selectedSelectValue = $('.top_select_values').val();
    console.log('$selectedObject: ', selectedObject);
    console.log('$selectedField: ', selectedField);
    console.log('$selectedFilter: ', selectedFilter);
    console.log('$selectedInpValue: ', selectedInpValue);
    console.log('$selectedSelectValue: ', selectedSelectValue);
    if(selectedSelectValue){
        selectedInpValue = selectedSelectValue;
    }

    if (!selectedObject) {
        showMessage('Select Object');
        return;
    }
    /* if (!selectedField) {
        showMessage('Select Field');
        return;
    } */
    /* if (!selectedFilter) {
        showMessage('Select Filter');
        return;
    } */
    /* if (!selectedInpValue && !selectedSelectValue) {
        showMessage('Select Filter Value');
        return;
    } */

    let query = 'Select Id From ' + selectedObject;
    let fieldsArray = ['Id', 'CreatedDate'];
    if (selectedObject == 'Contact') {
        fieldsArray = ['Id', 'FirstName', 'LastName', 'Email', 'Phone', 'CreatedDate'];
        query = `Select Id, CreatedDate, FirstName, LastName, Email, Phone From ${selectedObject}`;
    } else if (selectedObject == 'Account') {
        fieldsArray = ['Id', 'Name', 'Phone', 'BillingCity', 'BillingState', 'Website', 'CreatedDate'];
        query = `Select Id, CreatedDate, Name, Phone, BillingCity, BillingState, Website From ${selectedObject}`;
    } else if (selectedObject == 'Case') {
        fieldsArray = ['Id', 'CaseNumber', 'Subject', 'Priority', 'ContactId', 'AccountId', 'CreatedDate'];
        query = `Select Id, CreatedDate, CaseNumber, Subject, Priority, ContactId, AccountId From ${selectedObject}`;
        // fieldsArray = ['Id', 'Status', 'Subject', 'Type', 'CCHMC_Type__c','CCHMC_First_Call_Resolution__c', 'Reason', 'CreatedDate', 'ClosedDate', 'RecordType'];
        // query = `Select Id, Status, Subject, Type, CCHMC_Type__c, CCHMC_First_Call_Resolution__c, Reason, CreatedDate, ClosedDate, RecordType.Name From ${selectedObject}`;
    } else if (selectedObject == 'User') {
        fieldsArray = ['Id', 'Name', 'Email', 'Username', 'IsActive', 'Profile Name', 'CreatedDate'];
        query = `SELECT Id, CreatedDate, Name, Email, Username, IsActive, Profile.Name FROM ${selectedObject}`;
    } else if (selectedObject == 'Order') {
        fieldsArray = ['Id', 'OrderReferenceNumber', 'Status', 'BillingEmailAddress', 'CreatedDate', 'Type', 'GrandTotalAmount'];
        query = `SELECT Id, CreatedDate, OrderReferenceNumber, Status, BillingEmailAddress, Type, GrandTotalAmount FROM ${selectedObject}`;
    } else if (selectedObject == 'OrderItem') {
        fieldsArray = ['Id', 'Quantity', 'UnitPrice', 'CreatedDate', 'Type', 'TotalLineAmount'];
        query = `SELECT Id, CreatedDate, Quantity, UnitPrice, Type, TotalLineAmount FROM ${selectedObject}`;
    } else if (selectedObject == 'Product2') {
        fieldsArray = ['Id', 'Name', 'StockKeepingUnit','IsActive', 'CreatedDate', 'Family'];
        query = `SELECT Id, CreatedDate, Name, StockKeepingUnit, IsActive, Family FROM ${selectedObject}`;
    } else if (selectedObject == 'CartItem') {
        fieldsArray = ['Id', 'Name', 'Sku','ListPrice', 'CreatedDate', 'Quantity', 'TotalPrice', 'CartId'];
        query = `SELECT Id, CreatedDate, Name, Sku, ListPrice, Quantity, TotalPrice, CartId FROM ${selectedObject}`;
    } else if (selectedObject == 'WebCart') {
        fieldsArray = ['Id', 'Name', 'Type','Status', 'CreatedDate', 'AccountId', 'WebStoreId'];
        query = `SELECT Id, CreatedDate, Name, Type, Status, AccountId, WebStoreId FROM ${selectedObject}`;
    } else if (selectedObject == 'WhatsApp__c') {
        fieldsArray = ['Id', 'Name', 'Title__c', 'Body__c', 'Body_Long__c', 'From__c', 'IsMedia__c', 'FileId__c', 'From__c', 'CreatedDate'];
        query = `SELECT Id, CreatedDate, Name, Title__c, Body__c, Body_Long__c, IsMedia__c, FileId__c, From__c FROM ${selectedObject}`;
    } else if (selectedObject == 'English__c') {
        fieldsArray = ['Id', 'Name', 'English__c', 'Hindi__c', 'Is_Sentence__c', 'CreatedDate'];
        query = `SELECT Id, CreatedDate, Name, English__c, Hindi__c, Is_Sentence__c FROM ${selectedObject}`;
    } else {
        fieldsArray = ['Id', 'CreatedDate'];
        let nameField = fieldsAll.find(f => {
            return f.name == 'Name';
        });
        let nameFieldName = nameField?.name ? ', ' + nameField?.name : '';
        if(selectedObject.endsWith('__mdt')){
            nameFieldName = nameFieldName.replaceAll('Name','DeveloperName');
        }
        console.log('$nameFieldName: ', nameFieldName);
        if (nameFieldName) {
            fieldsArray.push(nameField?.name);
            query = `SELECT Id, CreatedDate ${nameFieldName} FROM ${selectedObject}`;
        } else {
            let autoNuberField = fieldsAll.find(f => {
                return f.autoNumber == true;
            });
            let autoNumberField = autoNuberField?.name ? ', ' + autoNuberField?.name : '';
            console.log('$autoNumberField: ', autoNumberField);
            if (autoNumberField && autoNuberField.name != 'Name') {
                fieldsArray.push(autoNuberField?.name);
                query = `SELECT Id, CreatedDate ${autoNumberField} FROM ${selectedObject}`;
            }
        }
    }
    console.log('$query: ', query);
    console.log('$selectedObject: ', selectedObject);
    let limit = '';
    if(selectedField){
        let fieldObj = fieldsAll.find(f => {
            return f.name == selectedField;
        });
        console.log(fieldObj);
        if (selectedFilter == 'INCLUDES') {
            query += ` Where ${selectedField} LIKE '%${selectedInpValue}%'`
        } else if (selectedFilter == 'NOT INCLUDES') {
            query += ` Where NOT(${selectedField} LIKE '%${selectedInpValue}%')`
        } else if (selectedFilter == 'EQUALS') {
            if(fieldObj.type == 'boolean'){
                query += ` Where ${selectedField} = ${selectedInpValue}`
            }else{
                query += ` Where ${selectedField} = '${selectedInpValue}'`
            }
        } else if (selectedFilter == 'NOT EQUALS') {
            if(fieldObj.type == 'boolean'){
                query += ` Where ${selectedField} != ${selectedInpValue}`
            }else{
                query += ` Where ${selectedField} != '${selectedInpValue}'`
            }
        }
    }
    if(selectedFilter == 'LIMIT' && selectedInpValue){
        limit = ' LIMIT ' + selectedInpValue;
    }
    query += ` Order By CreatedDate DESC${limit}`;
    if(selectedObject.endsWith('__mdt')){
        // query = query.replaceAll('CreatedDate','SystemModstamp');
        query = `Select Id, DeveloperName, Label, MasterLabel From ${selectedObject} Order By SystemModstamp DESC`;
        fieldsArray = ['Id', 'DeveloperName', 'Label', 'MasterLabel'];
    }
    console.log('$query-FINAL: ', query);
    console.log('$query-fieldsArray: ', fieldsArray);
    getRecords(query, fieldsArray);

});

async function getRecords(query, fieldsArray) {
    showSpinner();
    let apiResponse = await getRecordsFromServer(query);
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    if (data) {
        prepareRecordsARRAY(data, fieldsArray);
        console.log('$recordsAll: ', recordsAll);
        generateTableHeaders(fieldsArray);
        generateTable(fieldsArray);
    }
    hideSpinner();
}

function generateTableHeaders(fieldsArray) {
    let thTags = '';
    fieldsArray.forEach((val, index) => {
        thTags += `<th class="th_1 th_1_${index}">
            ${val}
        </th>`
    });
    $('.thead_1_tr').html(thTags);
}

/* $(document).on('click', '.td_ID', function (e) {
    let recordID = $(this).attr('data-id');
    openRecordDetail(recordID);
}); */

$(document).on('click', '.th_1_data', function (e) {
    $('.dropdown_contents_fields').addClass('hide');
    $('.dropdown_contents_sobjects').addClass('hide');
    copyToCLipboard($(this).text().trim(), true);
    $('.th_1_data').css('color','rgb(42, 40, 40)');
    $(this).css('color','red');
});

$(document).on('contextmenu', '.th_1_data', function (e){
    let text = $(this).text().trim();
    if(idCheck(text)){
       e.preventDefault();
       $('.th_1_data').css('color','rgb(42, 40, 40)');
        $(this).css('color','red');
       openRecordDetail(text);
   }
});

function idCheck(recordID){
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    return userKeyRegExp.test(recordID);
}

function openRecordDetail(recordID){
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    const valid = userKeyRegExp.test(recordID);
    if (valid) {
        recordID = 'recordID=' + recordID + '&';
        openMaximized('record.html?' + recordID + 'baseUrl=' + baseUrl + '&sessionId=' + sessionId);
    }
}

$(document).on('keydown', '.dropdown_inp', function (e) {
    console.log('$e.keyCode: ',e.keyCode);
    if (e.keyCode == 27 || e.keyCode == 9 || e.keyCode == 32) {
        $(this).blur();
        $('.dropdown_contents_fields').addClass('hide');
        $('.dropdown_contents_sobjects').addClass('hide');
    }
});

function copyToCLipboard(value, showTst) {
    let text = value;
    navigator.clipboard.writeText(text).then(function () {
        console.log('copied : ' + text);
        if (showTst) {
            $('.snackbar').text(text);
            showToast();
        }
    }, function (err) {
        console.error('error copying');
    });
}

function openMaximized(url) {
    if (url) {
        chrome.windows.create({
            type: 'popup',
            url: url,
            state: 'maximized'
        });
    }
}

function generateTable(fieldsArray) {
    let trTags = '';
    // recordsAll = [...recordsAll, ...recordsAll];
    recordsAll.forEach(rec => {
        let tdTags = '';
        fieldsArray.forEach(field => {
            if(field == 'CreatedDate'){
                // let created_date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(rec[field]));
                // created_date_time = created_date_time.replaceAll(',', '').toUpperCase().split(' ').join(' ');
                // rec[field] = created_date_time;
                let date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'}).format(new Date(rec[field]));
                date_time = date_time.substring(0, date_time.length - 2) + date_time.substring(date_time.length - 2).toUpperCase();
                rec[field] = date_time;
            }
            let dataId = '';
            let idClass = '';
            if (field == 'Id') {
                idClass = 'td_ID';
                dataId = `td_ID data-id=${rec.Id}`;
            }
            tdTags += `<td class="td_1 td_1_2 th_1_data ${idClass}" ${dataId}>
                ${rec[field]}
            </td>`
        });

        trTags += `<tr class="tbody_1_tr tbody_1_tr_1 tr_${rec.Id}">${tdTags}</tr>`;
    });
    document.title = 'Records List - [ ' + recordsAll.length + ' ]';
    $('.tbody_1').html(trTags);
}

function checkResponse(apiResponse) {
    if (apiResponse.isError) {
        hideSpinner();
        $('.snackbar').text(apiResponse.message);
        showToast();
        return null;
    } else {
        return apiResponse.data;
    }
}

async function getRecordsFromServer(query) {
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
    var requestOptions = {
        method: 'POST',
        headers: {
            "Content-Type": "text/xml",
            "SOAPAction": "urn:enterprise.soap.sforce.com/query",
        },
        body: soapRequest,
        redirect: 'follow'
    };

    try {
        const response = await fetch(baseUrl + "/services/Soap/c/59.0", requestOptions);
        console.log('$response: ', response);
        if (!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.text();
        return { isError: false, data: result };
    } catch (error) {
        return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}

function prepareRecordsARRAY(xmlResponse, fieldsArray) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");
    records = [];
    fieldsArray = fieldsArray ? fieldsArray : ['Id'];
    let recordNodes = xmlDoc.querySelectorAll('records');
    recordNodes.forEach(recordNode => {
        let rec = {};
        fieldsArray.forEach(field => {
            let fieldData = recordNode.querySelector(field)?.textContent;
            rec[field] = fieldData == undefined ? '' : fieldData;
        });
        let profile = recordNode.querySelector('Profile');
        let profileName = profile?.querySelector('Name')?.textContent;
        if (profileName) {
            rec['Profile Name'] = profileName;
        }
        let recordType = recordNode.querySelector('RecordType');
        let recordTypeName = recordType?.querySelector('Name')?.textContent;
        if (recordTypeName) {
            rec['Record Type'] = recordTypeName;
        }
        records.push(rec);
    });
    recordsAll = [...records];
}

function showMessage(msg) {
    $('.snackbar').text(msg);
    showToast();
}

async function getFields(objectAPIName) {
    $('.dropdown_inp_fields').attr('disabled', 'true');
    let apiResponse = await getFieldsFromServer(objectAPIName);
    $('.dropdown_inp_fields').removeAttr('disabled');
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$data: ', data);
    if (data) {
        fieldsAll = [...data.fields];
        console.log('$fieldsAll: ', fieldsAll);
        generateFieldsDropdowns(null);
        /*
        if ((!element.nillable && !element.defaultedOnCreate && element.updateable && element.createable) || (element.updateable && element.name !== "OwnerId")) {
            if (originalRecord.hasOwnProperty(element.name) && (originalRecord[element.name] || originalRecord[element.name] == 0)) {
                if(element.relationshipName){
                    let parentId = originalRecord[element.name];
                    let parent = keyPrefixAndObjectNameMap.get(parentId.substring(0, 3));
                    parentIdMap.set(parentId, {parentName: parent, parentField: element.name});
                }
            }
        }
        */
    }
}

function getFilteredFieldsList(searchTerm) {
    let list = [];
    fieldsAll.forEach(val => {
        if (searchTerm && !val.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return;
        } else {
            list.push(val.name);
        }
    });
    return list;
}

function generateFieldsDropdowns(searchTerm) {
    let list = getFilteredFieldsList(searchTerm);
    liTags = '';
    list.forEach(val => {
        liTags += `<li class="d_li d_li_fields">${val}</li>`;
    });
    $('.d_ul_fields').html(liTags);
}

async function getFieldsFromServer(objectAPIName) {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    try {
        const response = await fetch(baseUrl + '/services/data/v59.0/sobjects/' + objectAPIName + '/describe', requestOptions);
        if (!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result };
    } catch (error) {
        return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}

$(document).on('change', '.top_select_filter', function (e) {
    let val = $(this).val().trim();
    console.log('val: ', val);
    if (val == 'LIMIT') {
        $('.inp_value').val('');
        $('.inp_value').attr('type', 'number');
    }else{
        $('.inp_value').attr('type', 'text');
        $('.inp_value').val('');
    }
});
//CODE STARTS
$(document).on('click', '.top_code_btn', async function (e){
    apiName = $('.dropdown_inp_sobjects').val();
    if(apiName){
        let apiResponse = await getFieldsFromServer(apiName);
        console.log('$apiResponse: ', apiResponse);
        let data = checkResponse(apiResponse);
        console.log('$data: ', data);
        if (data) {
            fieldsAll = [...data.fields];
            console.log('$fieldsAll: ', fieldsAll);
            fieldsAll.forEach(val => {
                console.log('$FIELD: ',val.name);
            });
            currentDescribedObject = data;
            console.log('$currentDescribedObject: ',currentDescribedObject);
            onSObjectListToApexClick();
        }
    }
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
        $('.top_getrecords_btn').text('[-'+(index + 1)+'-]');
    });
    await Promise.all(promises);
    completeDetail += `insert ${objName}sList;\n`;
    completeDetail += `System.debug('${objName}sList: ' + ${objName}sList);`;
    console.log(completeDetail);

    showDiv('small_popup_4');
    $('.d_outer').addClass('blur');
    $('.small_popup_4_box_heading_div').text('New ' + apiName + ' List [ ' + recordsAll.length + ' ]');
    editor = ace.edit(document.querySelector("#editor"));
    editor.setOptions({
        mode: "ace/mode/apex"
    });
    editor.getSession().setValue(completeDetail);
    $('.top_getrecords_btn').text('Get Records');
}
$(document).on('click', '.copy-icon_4', function (e){
    let text = editor.getSession().getValue();
    navigator.clipboard.writeText(text).then(function () {
         $('.snackbar').text('Copied.');
         showToast();
     }, function (err) {
         console.error('error copying');
     });
 });
$(document).on('click', '.close-icon_4', function (e) {
    hideDiv('small_popup_4');
    $('.d_outer').removeClass('blur');
});
function showDiv(element) {
    $('.' + element).removeClass('hide');
}
function hideDiv(element) {
    $('.' + element).addClass('hide');
}
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
//CODE ENDS