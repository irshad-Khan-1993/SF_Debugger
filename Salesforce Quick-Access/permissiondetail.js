let baseUrl = null;
let sessionId = null;
let apiName = null;
let recId = null;
let allPermissionSets;
let objectNameLabelMap;
let allPermissionSetsData;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    recId = url.searchParams.get('recId');
    console.log('$recId: ', recId);
    apiName = url.searchParams.get('apiName');
    console.log('$apiName: ', apiName);
    document.title = document.title + ' - ' + apiName;
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    // hideSpinner();
    fetchObjects();
    // getPermissionSets();
});

function fetchObjects() {
    showSpinner();
    objectNameLabelMap = new Map();
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    fetch(baseUrl + "/services/data/v59.0/sobjects", requestOptions).then(response => response.json()).then(result => {
        console.log('$API: ', result)
        let objects = result;
        console.log('$objects: ', objects);
        objects.sobjects.forEach(val => {
            if(val.queryable && val.createable)
                objectNameLabelMap.set(val.name, val.label);
        });
        getPermissionSets();
    }).catch(error => {
        console.log('$getObjects: error', error);
    });
}


async function getPermissionSets(){
    let apiResponse =  await getPermissionSetsFromServer();
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$data: ',data);

    allPermissionSets = [];

    let mapObjectAndPermissionMap = new Map();
    data.records.forEach(val => {
        let permissionArray = [];
        if(val.PermissionsCreate){
            permissionArray.push('Create');
        }
        if(val.PermissionsRead){
            permissionArray.push('Read');
        }
        if(val.PermissionsEdit){
            permissionArray.push('Edit');
        }
        if(val.PermissionsViewAllRecords){
            permissionArray.push('View All');
        }
        if(val.PermissionsModifyAllRecords){
            permissionArray.push('Modify All');
        }
        allPermissionSets.push({
            Label: objectNameLabelMap.get(val.SobjectType),
            Name: val.SobjectType,
            IsCustom: permissionArray.join(', ')
        });
        mapObjectAndPermissionMap.set(val.SobjectType, permissionArray.join(', '));
    });
    console.log('$mapObjectAndPermissionMap: ',mapObjectAndPermissionMap);
    
    allPermissionSetsData = [];
    let uniquePermissinsArray = [];
    for(const [key, value] of objectNameLabelMap) {
        if(mapObjectAndPermissionMap.has(key)){
            allPermissionSetsData.push({
                Label: value,
                Name: key,
                IsCustom: mapObjectAndPermissionMap.get(key)
            });
            if(!uniquePermissinsArray.includes(mapObjectAndPermissionMap.get(key))){
                uniquePermissinsArray.push(mapObjectAndPermissionMap.get(key));
            }
        }else{
            allPermissionSetsData.push({
                Label: value,
                Name: key,
                IsCustom: 'No Access'
            });
            if(!uniquePermissinsArray.includes('No Access')){
                uniquePermissinsArray.push('No Access');
            }
        }
    }
    console.log('$uniquePermissinsArray: ',uniquePermissinsArray);
    let options = '<option class="All" value="All">All</option><option class="Any" value="Any">Any</option>';
    uniquePermissinsArray.forEach(val => {
        options += `<option class="${val}" value="${val}">${val}</option>`;
    });
    $('.select_sessions').html(options);
    generateRows(allPermissionSetsData);
    hideSpinner();
}

$(document).on('change', '.select_sessions', function (e) {
    let select = $(this).val().trim();
    console.log('select: ', select);
    let filteredPermissinSets = [];
    allPermissionSetsData.forEach(val => {
        if(select == 'All'){
            filteredPermissinSets.push(val);
        }else if(select == 'Any'){
            if(val.IsCustom != 'No Access'){
                filteredPermissinSets.push(val);
            }
        }else{
            if(val.IsCustom == select){
                filteredPermissinSets.push(val);
            }
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
    let filteredPermissinSets = allPermissionSetsData.filter(rec => {
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
        allPermissionSetsData.sort((a, b) => {
            return a[th].localeCompare(b[th]);
        });
    } else if (order == 'Desc') {
        allPermissionSetsData.sort((b, a) => {
            return a[th].localeCompare(b[th]);
        });
    }
    generateRows(allPermissionSetsData);
}

function generateRows(permissionSets){
    let rows = '';
    permissionSets.forEach(val => {
        rows += `<tr class="tr">
            <td class="td td-prop td-name" data-apiName="${val.Name}" data-recId="${val.Id}">${val.Label}</td>
            <td class="td td-prop td-label" data-apiName="${val.Name}" data-recId="${val.Id}">${val.Name}</td>
            <td class="td td-prop td-type" data-apiName="${val.Name}" data-recId="${val.Id}">${val.IsCustom}</td>
        </tr>`;
    });

    $('.tbody').html(rows);
    $('.total').text('TOTAL [ ' + permissionSets.length + ' ]');
}

$(document).on('click', '.td-prop', function (e) {
    let _apiName = $(this).attr('data-apiName');
    console.log('$_apiName: ', _apiName);
    // copyToCLipboard(_apiName);
    openMaximized(`fieldpermissions.html?apiName=${_apiName}&psname=${apiName}&sessionId=${sessionId}&baseUrl=${baseUrl}&recId=${recId}`);
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

async function getPermissionSetsFromServer() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };
    
    try{
        const response = await fetch(baseUrl + `/services/data/v59.0/query?q=SELECT+Id,ParentId,SobjectType,PermissionsCreate,PermissionsRead,PermissionsDelete,PermissionsEdit,PermissionsViewAllRecords,PermissionsModifyAllRecords+FROM+ObjectPermissions+Where+ParentId='${recId}'`, requestOptions);
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