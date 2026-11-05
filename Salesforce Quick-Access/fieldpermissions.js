let baseUrl = null;
let sessionId = null;
let apiName = null;
let psname = null;
let recId = null;
let allPermissionSets;
let fieldNameLabelMap;
let allPermissionSetsData;
let allFieldPermissions;
let fieldNameMap;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    recId = url.searchParams.get('recId');
    console.log('$recId: ', recId);
    apiName = url.searchParams.get('apiName');
    console.log('$apiName: ', apiName);
    psname = url.searchParams.get('psname');
    console.log('$psname: ', psname);
    document.title = document.title + ' - ' + apiName + ' - ' + psname;
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    getObjectDescribe();

});

function getObjectDescribe() {
    showSpinner();
    fieldNameMap = new Map();
    fieldNameLabelMap = new Map();
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    fetch(baseUrl + "/services/data/v51.0/sobjects/"+apiName+"/describe", requestOptions).then(response => response.json()).then(result => {
        console.log('$API: ', result)
        let describe = result;
        console.log('$describe: ', describe);
        console.log('$describe.fields: ',describe.fields);
        describe.fields.forEach(val => {
            // if(val.permissionable){
                fieldNameLabelMap.set(val.name, val.label);
                fieldNameMap.set(val.name, val);
            // }
        });
        console.log('$fieldNameLabelMap: ',fieldNameLabelMap);
        getFieldPermissions();
    }).catch(error => {
        console.log('$getObjects: error', error);
    });
}


async function getFieldPermissions(){
    let apiResponse =  await getFieldPermissionsFromServer();
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$data: ',data);

    allFieldPermissions = [];

    let fieldpermissionsMap = new Map();
    data.records.forEach(val => {
        let read = val.PermissionsRead;
        let edit = val.PermissionsEdit;

        let readString = read ? 'Read' : '';
        let editString = edit ? 'Edit' : '';

        let readeditString = '';
        if(readString){
            readeditString += readString;
        }
        if(editString){
            readeditString += ', ' + editString;
        }
        
        if(readString && editString){
            readeditString = readString + ', ' + editString;
        }

        fieldpermissionsMap.set(val.Field.split('.')[1], {
            read: readString,
            edit: editString,
            readedit: readeditString
        });
    });
    console.log('$fieldpermissionsMap: ',fieldpermissionsMap);

    for(const [key, value] of fieldNameLabelMap) {
        if(fieldpermissionsMap.has(key)){
            allFieldPermissions.push({
                name: key,
                label: value,
                read: fieldpermissionsMap.get(key).read,
                edit: fieldpermissionsMap.get(key).edit,
                readedit: fieldpermissionsMap.get(key).readedit,
                class: fieldNameMap.get(key).permissionable ? '' : 'not-permissionable',
                type: fieldNameMap.get(key).custom ? 'custom' : 'standard'
            });
        }else{
            allFieldPermissions.push({
                name: key,
                label: value,
                read: '',
                edit: '',
                readedit: '',
                class: fieldNameMap.get(key).permissionable ? '' : 'not-permissionable',
                type: fieldNameMap.get(key).custom ? 'custom' : 'standard'
            });
        }
    }
    console.log('$allFieldPermissions: ',allFieldPermissions);
    generateRows(allFieldPermissions);
}

$(document).on('change', '.select_sessions', function (e) {
    let select = $(this).val().trim();
    console.log('select: ', select);
    console.log('$fieldNameMap: ',fieldNameMap);
    let filteredPermissinSets = [];
    allFieldPermissions.forEach(val => {
        if(select == 'All'){
            filteredPermissinSets.push(val);
        }else if(select == 'Custom' && fieldNameMap.get(val.name).custom){
            filteredPermissinSets.push(val);
        }else if(select == 'Standard' && !fieldNameMap.get(val.name).custom){
            filteredPermissinSets.push(val);
        }
    });
    generateRows(filteredPermissinSets);
    $('.chng-session').text(select);
});

$(document).on('input', '.inp', function (e) {
    let search = $(this).attr('data-search');
    let search_text = $(this).val().trim();
    console.log('$search_text: ', search_text);
    console.log('$search: ', search);
    console.log('$allFieldPermissions: ',allFieldPermissions);
    let filteredPermissinSets = allFieldPermissions.filter(rec => {
        return rec[search].toLowerCase().includes(search_text.toLowerCase());
    });
    generateRows(filteredPermissinSets);
});

$(document).on('click', '.th_field', function (e) {
    let th = $(this).attr('data-id');
    console.log('$th: ', th);
    var icon = $(this).find("i");
    console.log('$icon: ', icon);
    if (icon.hasClass("fa-angle-down")) {
        icon.removeClass("fa-angle-down").addClass("fa-angle-up");
        sortRecords(th, 'Desc');
    } else if (icon.hasClass("fa-angle-up")) {
        icon.removeClass("fa-angle-up").addClass("fa-angle-down");
        sortRecords(th, 'Asc');
    }
});

function sortRecords(th, order) {
    if (order == 'Asc') {
        allFieldPermissions.sort((a, b) => {
            return a[th].localeCompare(b[th]);
        });
    } else if (order == 'Desc') {
        allFieldPermissions.sort((b, a) => {
            return a[th].localeCompare(b[th]);
        });
    }
    generateRows(allFieldPermissions);
}

function generateRows(permissions){

    let rows = '';
    permissions.forEach((val, index) => {
        rows += `<tr class="tr">
            <td class="td td-prop td-label ${val.class}" data-apiName="${val.label}">${val.label}</td>
            <td class="td td-prop td-name  ${val.class}" data-apiName="${val.name}">${val.name}</td>
            <td class="td td-prop td-type  ${val.class}" data-apiName="${val.readedit}">${val.readedit}</td>
        </tr>`;
    });

    $('.tbody').html(rows);
    $('.total').text('TOTAL [ ' + permissions.length + ' ]');
    hideSpinner();
}


$(document).on('click', '.td-prop', function (e) {
    let apiName = $(this).attr('data-apiName');
    console.log('$apiName: ', apiName);
    copyToCLipboard(apiName);
});

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

async function getFieldPermissionsFromServer() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    let query = `SELECT+Field,PermissionsEdit,PermissionsRead+FROM+`;
    query += `FieldPermissions+Where+SobjectType+=+'${apiName}'+And+Parent.Name+=+'${psname}'`;
    
    try{
        const response = await fetch(baseUrl + `/services/data/v59.0/query?q=${query}`, requestOptions);
        if(!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result};
    }catch(error){
       return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
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