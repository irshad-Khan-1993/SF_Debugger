let baseUrl = null;
let sessionId = null;

let allPermissionSets;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    setSessionText();
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    getPermissionSets();
});


//
async function getPermissionSets(){
    showSpinner();
    let apiResponse =  await getPermissionSetsFromServer();
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$data: ',data);
    allPermissionSets = [...data.records];
    generateRows(allPermissionSets);
    hideSpinner();
}

$(document).on('change', '.select_sessions', function (e) {
    let select = $(this).val().trim();
    console.log('select: ', select);
    let filteredPermissinSets = [];
    allPermissionSets.forEach(val => {
        if(select == 'Custom'){
            if(val.IsCustom){
                filteredPermissinSets.push(val);
            }
        }else if(select == 'Standard'){
            if(!val.IsCustom){
                filteredPermissinSets.push(val);
            }
        }else{
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
    let filteredPermissinSets = allPermissionSets.filter(rec => {
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
        allPermissionSets.sort((a, b) => {
            return a[th].localeCompare(b[th]);
        });
    } else if (order == 'Desc') {
        allPermissionSets.sort((b, a) => {
            return a[th].localeCompare(b[th]);
        });
    }
    generateRows(allPermissionSets);
}

function generateRows(permissionSets){
    let rows = '';
    permissionSets.forEach(val => {
        rows += `<tr class="tr">
            <td class="td td-prop td-name" data-copydata="${val.Label}" data-apiName="${val.Name}" data-recId="${val.Id}">${val.Label}</td>
            <td class="td td-prop td-label" data-copydata="${val.Name}" data-apiName="${val.Name}" data-recId="${val.Id}">${val.Name}</td>
            <td class="td td-prop td-type" data-copydata="${val.IsCustom}" data-apiName="${val.Name}" data-recId="${val.Id}">${val.IsCustom}</td>
        </tr>`;
    });

    $('.tbody').html(rows);
    $('.total').text('TOTAL [ ' + permissionSets.length + ' ]');
}

$(document).on('contextmenu', '.td-prop', async function (e) {
    e.preventDefault();
    let copydata = $(this).attr('data-copydata');
    console.log('$copydata: ', copydata);
    copyToCLipboard(copydata);
    /* let recordsParam = {
        sessionId: sessionId,
        baseUrl: baseUrl,
        apiName: apiName
    };
    console.log('$recordsParam: ', recordsParam);
    openMaximized(`records.html?apiName=${apiName}&sessionId=${sessionId}&baseUrl=${baseUrl}&objectId=${objectNameAndIdMap.get(apiName)}`); */
});

$(document).on('click', '.td-prop', function (e) {
    let apiName = $(this).attr('data-apiName');
    console.log('$apiName: ', apiName);
    let recId = $(this).attr('data-recId');
    console.log('$recId: ', recId);
    openMaximized(`permissiondetail.html?apiName=${apiName}&sessionId=${sessionId}&baseUrl=${baseUrl}&recId=${recId}`);
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

async function getPermissionSetsFromServer() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };
    
    try{
        const response = await fetch(baseUrl + '/services/data/v59.0/query?q=SELECT+Id,IsCustom,Label,Name+FROM+PermissionSet+Order+By+Label', requestOptions);
        if(!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result};
    }catch(error){
       return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}

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

function openMaximized(url) {
    if (url) {
        chrome.windows.create({
            type: 'popup',
            url: url,
            state: 'maximized'
        });
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