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
    let fields_array = [];
    fields_array.push('Id');
    fields_array.push('Name');
    fields_array.push('Email');
    fields_array.push('Username');
    fields_array.push('Profile');
    fields_array.push('Role');
    fields_array.push('IsActive');

    let q = 'SELECT Id, Name, Email, Username, Profile.Name, UserRole.Name, IsActive FROM User';
    getRecords(q, fields_array);
    getRoles();
    getProfiles();
});

//PROFILE

async function getProfiles(){
    let apiResponse =  await getProfilesFromServer();
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$profiles: ',data);
    let options = '<option value="No Profile Filter" selected>No Profile Filter</option>';
    data.records.forEach(val => {
        options += `<option value="${val.Name}">${val.Name}</option>`;
    });
    $('.profile_filters').html(options);
}

async function getRoles(){
    let apiResponse =  await getRolesFromServer();
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$roles: ',data);
    let options = '<option value="No Roles Filter" selected>No Roles Filter</option>';
    data.records.forEach(val => {
        options += `<option value="${val.Name}">${val.Name}</option>`;
    });
    $('.role_filters').html(options);
}

function checkResponse(apiResponse){
    if(apiResponse.isError){
        hideSpinner();
        $$('.snackbar').text(apiResponse.message);
        showToast();
        return null;
    }else{
        return apiResponse.data;
    }
}

async function getProfilesFromServer() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };
    
    try{
        const response = await fetch(baseUrl + '/services/data/v59.0/query?q=SELECT+Id,Name+FROM+Profile+Order+By+Name', requestOptions);
        if(!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result};
    }catch(error){
       return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}

async function getRolesFromServer() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };
    
    try{
        const response = await fetch(baseUrl + '/services/data/v59.0/query?q=SELECT+Id,Name+FROM+UserRole+Order+By+Name', requestOptions);
        if(!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result};
    }catch(error){
       return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}

async function getRecords(query, fieldsArray) {
    showSpinner();
    let apiResponse = await getRecordsFromServer(query);
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    if (data) {
        prepareRecordsARRAY(data, fieldsArray);
        console.log('$recordsAll: ', recordsAll);
        generateTable([...recordsAll]);
    }
    hideSpinner();
}

function prepareRecordsARRAY(xmlResponse, fieldsArray) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");
    records = [];
    fieldsArray = fieldsArray ? fieldsArray : ['Id'];
    let recordNodes = xmlDoc.querySelectorAll('records');
    recordNodes.forEach(recordNode => {
        let rec = {
            Id: recordNode.querySelector('Id')?.textContent ?? '',
            Name: recordNode.querySelector('Name')?.textContent ?? '',
            Username: recordNode.querySelector('Username')?.textContent ?? '',
            Email: recordNode.querySelector('Email')?.textContent ?? '',
            IsActive: recordNode.querySelector('IsActive')?.textContent ?? '',
        };
        let profile = recordNode.querySelector('Profile');
        let profileName = profile?.querySelector('Name')?.textContent ?? '';
        if (profileName) {
            rec['Profile'] = profileName;
        }
        let role = recordNode.querySelector('UserRole');
        let roleName = role?.querySelector('Name')?.textContent ?? '';
        if (roleName) {
            rec['Role'] = roleName;
        }
        rec['Role'] = rec['Role'] ?? '';
        rec['Profile'] = rec['Profile'] ?? '';
        rec['IsActive'] = rec['IsActive'] == 'true';
        records.push(rec);
    });
    recordsAll = [...records];
}

$(document).on('input', '.dropdown_inp_names', function (e){
   let val = $(this).val().trim();
   console.log('val: ',val);
   if(val){
        let recordsArray = [];
        recordsAll.forEach(rec => {
            if(rec.Name.toLowerCase().includes(val.toLowerCase())){
                recordsArray.push({...rec});
            }
        });
        generateTable(recordsArray);
   }else{
        generateTable([...recordsAll]);
   }
});

$(document).on('input', '.dropdown_inp_id', function (e){
   let val = $(this).val().trim();
   console.log('val: ',val);
   if(val){
        let recordsArray = [];
        recordsAll.forEach(rec => {
            if(rec.Id == val){
                recordsArray.push({...rec});
            }
        });
        generateTable(recordsArray);
   }else{
        generateTable([...recordsAll]);
   }
});

$(document).on('change', '.profile_filters', function (e){
    let val = $(this).val().trim();
    console.log('val: ',val);
    if(val != 'No Profile Filter'){
         let recordsArray = [];
         recordsAll.forEach(rec => {
             if(rec.Profile.toLowerCase() == val.toLowerCase()){
                 recordsArray.push({...rec});
             }
         });
         generateTable(recordsArray);
         $('.no_filters').val('No Filter');
         $('.role_filters').val('No Roles Filter');
    }else{
         generateTable([...recordsAll]);
    }
 });
$(document).on('change', '.role_filters', function (e){
    let val = $(this).val().trim();
    console.log('val: ',val);
    if(val != 'No Roles Filter'){
         let recordsArray = [];
         recordsAll.forEach(rec => {
             if(rec.Role.toLowerCase() == val.toLowerCase()){
                 recordsArray.push({...rec});
             }
         });
         generateTable(recordsArray);
         $('.no_filters').val('No Filter');
         $('.profile_filters').val('No Profile Filter');
    }else{
         generateTable([...recordsAll]);
    }
 });
$(document).on('change', '.no_filters', function (e){
   
    let val = $(this).val().trim();
    console.log('val: ',val);
    if(val != 'No Filter'){
         let recordsArray = [];
         recordsAll.forEach(rec => {
             let role_filter = $('.role_filters').val();
             let profile_filter = $('.profile_filters').val();
             if(val == 'Active Only'){
                 if(rec.IsActive){
                    if(profile_filter != 'No Profile Filter'){
                        if(rec.Profile.toLowerCase() == profile_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else if(role_filter != 'No Roles Filter'){
                        if(rec.Role.toLowerCase() == role_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else{
                        recordsArray.push({...rec});
                    }
                 }
             }else if(val == 'Inactive Only'){
                if(!rec.IsActive){
                    if(profile_filter != 'No Profile Filter'){
                        if(rec.Profile.toLowerCase() == profile_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else if(role_filter != 'No Roles Filter'){
                        if(rec.Role.toLowerCase() == role_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else{
                        recordsArray.push({...rec});
                    }
                }
            }else if(val == 'No Invalid Email'){
                if(!rec.Email.endsWith('.invalid')){
                    if(profile_filter != 'No Profile Filter'){
                        if(rec.Profile.toLowerCase() == profile_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else if(role_filter != 'No Roles Filter'){
                        if(rec.Role.toLowerCase() == role_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else{
                        recordsArray.push({...rec});
                    }
                }
            }else if(val == 'With Invalid Email'){
                if(rec.Email.endsWith('.invalid')){
                    if(profile_filter != 'No Profile Filter'){
                        if(rec.Profile.toLowerCase() == profile_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else if(role_filter != 'No Roles Filter'){
                        if(rec.Role.toLowerCase() == role_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else{
                        recordsArray.push({...rec});
                    }
                }
            }else if(val == 'With Profile'){
                if(rec.Profile){
                    if(profile_filter != 'No Profile Filter'){
                        if(rec.Profile.toLowerCase() == profile_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else if(role_filter != 'No Roles Filter'){
                        if(rec.Role.toLowerCase() == role_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else{
                        recordsArray.push({...rec});
                    }
                }
            }else if(val == 'Without Profile'){
                if(!rec.Profile){
                    if(profile_filter != 'No Profile Filter'){
                        if(rec.Profile.toLowerCase() == profile_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else if(role_filter != 'No Roles Filter'){
                        if(rec.Role.toLowerCase() == role_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else{
                        recordsArray.push({...rec});
                    }
                }
            }else if(val == 'With Role'){
                if(rec.Role){
                    if(profile_filter != 'No Profile Filter'){
                        if(rec.Profile.toLowerCase() == profile_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else if(role_filter != 'No Roles Filter'){
                        if(rec.Role.toLowerCase() == role_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else{
                        recordsArray.push({...rec});
                    }
                }
            }else if(val == 'Without Role'){
                if(!rec.Role){
                    if(profile_filter != 'No Profile Filter'){
                        if(rec.Profile.toLowerCase() == profile_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else if(role_filter != 'No Roles Filter'){
                        if(rec.Role.toLowerCase() == role_filter.toLowerCase()){
                            recordsArray.push({...rec});
                        }
                    }else{
                        recordsArray.push({...rec});
                    }
                }
            }
         });
         generateTable(recordsArray);
    }else{
         generateTable([...recordsAll]);
    }
 });
function generateTable(recordsArray) {
    let trTags = '';
    recordsArray.forEach(rec => {
        let tdTags = `<td class="td_1 td_1_2 record-id" title="${rec['Id']}">${rec['Id']}</td>`;
        tdTags += `<td class="td_1 td_1_3" title="${rec['Name']}">${rec['Name']}</td>`;
        tdTags += `<td class="td_1 td_1_4" title="${rec['Username']}">${rec['Username']}</td>`;
        tdTags += `<td class="td_1 td_1_5" title="${rec['Email']}">${rec['Email']}</td>`;
        tdTags += `<td class="td_1 td_1_6" title="${rec['Profile']}">${rec['Profile']}</td>`;
        tdTags += `<td class="td_1 td_1_7" title="${rec['Role']}">${rec['Role']}</td>`;
        tdTags += `<td class="td_1 td_1_8" title="${rec['IsActive']}">${rec['IsActive']}</td>`;
        tdTags += `<td class="td_1 td_1_9"><i class="open-icon fa fa-arrow-circle-o-up fa-2x" aria-hidden="true" data-recId="${rec['Id']}"></i></td>`;
        /*
        if(field == 'CreatedDate'){
            let date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'}).format(new Date(rec[field]));
            date_time = date_time.substring(0, date_time.length - 2) + date_time.substring(date_time.length - 2).toUpperCase();
            rec[field] = date_time;
        }
        */
        trTags += `<tr class="tbody_1_tr tbody_1_tr_1 tr_${rec.Id}">${tdTags}</tr>`;
    });
    document.title = 'Users - [ ' + recordsArray.length + ' ]';
    $('.tbody_1').html(trTags);
}

$(document).on('click', '.open-icon', function (e){
    let recordID = $(this).attr('data-recId');
    window.open(baseUrl + '/lightning/setup/ManageUsers/page?address=%2F'+recordID+'%3Fnoredirect%3D1');
});

$(document).on('click', '.td_1', function (e) {
    copyToCLipboard($(this).text().trim(), true);
});

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


$(document).on('contextmenu', '.record-id', function (e){
    let text = $(this).text().trim();
    e.preventDefault();
    openRecordDetail(text);
});


function openRecordDetail(recordID){
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    const valid = userKeyRegExp.test(recordID);
    if (valid) {
        recordID = 'recordID=' + recordID + '&';
        openMaximized('record.html?' + recordID + 'baseUrl=' + baseUrl + '&sessionId=' + sessionId);
    }
}

function copyToCLipboard(value, showTst) {
    if(value){
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