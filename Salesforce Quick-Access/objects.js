let baseUrl = null;
let sessionId = null;

let sobjects;
let sobjectsAll;
let csvArrayData;
let keyPrefixAndObjectArray;
let recordstable_popup;
let objectNameAndIdMap;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    setSessionText();
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    hideSpinner();
    fetchMetadatRecords();
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
function openMaximized(url) {
    if (url) {
        chrome.windows.create({
            type: 'popup',
            url: url,
            state: 'maximized'
        });
    }
}
//
let isCtrlPressed = false;
$(document).on('keydown', 'body', function (e){
   let charCode = (e.which) ? e.which : e.keyCode;
   if(charCode == 17){
      isCtrlPressed = true;
   }
   console.log('$isCtrlPressed: ',isCtrlPressed);
});
$(document).on('keyup', 'body', function (e){
   let charCode = (e.which) ? e.which : e.keyCode;
   isCtrlPressed = charCode == 17 ? false : isCtrlPressed;
   console.log('$isCtrlPressed: ',isCtrlPressed);

});
//
$(document).on('click', '.td-prop', function (e) {
    let apiName = $(this).attr('data-apiName');
    console.log('$apiName: ', apiName);
    if(isCtrlPressed){
        copyToCLipboard(apiName);
    }else{
        openMaximized(`fields.html?apiName=${apiName}&sessionId=${sessionId}&baseUrl=${baseUrl}&objectId=${objectNameAndIdMap.get(apiName)}`);
    }
});

$(document).on('input', '.inp', function (e) {
    let search = $(this).attr('data-search');
    let search_text = $(this).val().trim();
    console.log('$search_text: ', search_text);
    console.log('$search: ', search);
    let recs = sobjectsAll.filter(rec => {
        return rec[search].toLowerCase().includes(search_text.toLowerCase());
    });
    console.log('$recs: ', recs);
    sobjects = [...recs];
    generateTable();
});

function fetchMetadatRecords() {
    $('.inp').val('');
    $('.tbody').html('<div></div>');
    showSpinner();
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
        hideSpinner();
        objects.sobjects.forEach(val => {
            val.type = val.custom ? 'Custom' : 'Standard';
        });
        objects.sobjects.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });
        sobjects = [...objects.sobjects];
        sobjectsAll = [...objects.sobjects];
        generateTable();
        fetchObjectIds();
    }).catch(error => {
        console.log('$getObjects: error', error)
    });
}

function fetchObjectIds() {
    const soapRequest = `<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://soap.sforce.com/2006/04/metadata">
            <soapenv:Header>
                <tns:SessionHeader>
                    <tns:sessionId>${sessionId}</tns:sessionId>
                </tns:SessionHeader>
            </soapenv:Header>
            <soapenv:Body>
                <tns:listMetadata>
                    <listMetadataQuery>
                        <type>CustomObject</type>
                        <folder></folder>
                    </listMetadataQuery>
                    <asOfVersion>59.0</asOfVersion>
                </tns:listMetadata>
            </soapenv:Body>
        </soapenv:Envelope>`;

    fetch(baseUrl + '/services/Soap/m/59.0', {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml',
            'SOAPAction': 'login',
            'Accept': 'text/xml',
        },
        body: soapRequest,
    }).then(response => response.text()).then(xmlResponse => {
        console.log(xmlResponse);
        objectNameAndIdMap = new Map();
        console.log('$xmlResponse: ', xmlResponse);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

        let recordNodes = xmlDoc.querySelectorAll('result');

        for (let i = 0; i < recordNodes.length; i++) {
            let fullName = recordNodes[i].querySelector('fullName').textContent;
            let objectId = recordNodes[i].querySelector('id')?.textContent ? recordNodes[i].querySelector('id').textContent : fullName;
            objectNameAndIdMap.set(fullName, objectId);
        }
        console.log('$objectNameAndIdMap: ', objectNameAndIdMap);

    }).catch(error => {
        console.error('Error:', error);
    });
}

$(document).on('click', '.download-btn', function(e) {
    console.log('Checkpoint download-btn');
    console.log('$csvArrayData: ',csvArrayData);

    const csvContent = csvArrayData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8'
    });
    saveAs(blob, 'Objects.csv');
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
        sobjects.sort((a, b) => {
            return a[th].localeCompare(b[th]);
        });
    } else if (order == 'Desc') {
        sobjects.sort((b, a) => {
            return a[th].localeCompare(b[th]);
        });
    }
    generateTable();
}

$(document).on('contextmenu', '.select_sessions', async function (e) {
    e.preventDefault();
    let session_url = baseUrl + '/secur/frontdoor.jsp?sid=' + sessionId;
    console.log('$session_url: ', session_url);
    copyToCLipboard(session_url);
    await new Promise(resolve => setTimeout(resolve, 100));
    window.open(session_url, '_blank');
});
function generateTable() {

    let selected = $('.select_sessions').val();

    let rows = '';
    let total = 0;
    keyPrefixAndObjectArray = [];

    sobjectsAll.forEach(val => {
        if (val.associateEntityType || !val.keyPrefix) {
            return;
        }
        keyPrefixAndObjectArray.push({
            keyPrefix: val.keyPrefix, name: val.name
        });
    });
    $('.total').text('TOTAL [ ' + keyPrefixAndObjectArray.length + ' ]');
    csvArrayData = [['Label', 'Name', 'Type']];
    sobjects.forEach(val => {
        if (val.associateEntityType || !val.keyPrefix) {
            return;
        }
        if (selected == 'Custom Objects') {
            if (!val.name.endsWith('__c')) {
                return;
            }
        }
        if (selected == 'Standard Objects') {
            if (val.custom) {
                return;
            }
        }
        if (selected == 'Custom Metadata') {
            if (!val.name.endsWith('__mdt')) {
                return;
            }
        }
        if (selected == 'Custom Settings') {
            if (!val.customSetting) {
                return;
            }
        }
        if (selected == 'Big Objects') {
            if (!val.name.endsWith('__b')) {
                return;
            }
        }
        if (selected == 'Platform Events') {
            if (!val.name.endsWith('__e')) {
                return;
            }
        }
        total++;
        rows += `<tr class="tr">
            <td class="td td-prop td-name" data-apiName="${val.name}" data-label="${val.label}">${val.label}</td>
            <td class="td td-prop td-label" data-apiName="${val.name}" data-label="${val.label}">${val.name}</td>
            <td class="td td-prop td-type" data-apiName="${val.name}" data-label="${val.label}">${val.type}</td>
        </tr>`;
        csvArrayData.push([val.label.replaceAll(',','-'), val.name, val.type]);
    });

    $('.tbody').html(rows);
    // $('.chng-session').text($('.select_sessions').val() + ' [ ' + total + ' ]');
    console.log('$keyPrefixAndObjectArray: ', keyPrefixAndObjectArray);
    sessionStorage.setItem('keyPrefixAndObjectArray', JSON.stringify(keyPrefixAndObjectArray));
    hideSpinner();
}
$(document).on('change', '.select_sessions', function (e) {
    let val = $(this).val().trim();
    console.log('val: ', val);
    generateTable();
});

$(document).on('contextmenu', '.td-prop', async function (e) {
    e.preventDefault();
    let apiName = $(this).attr('data-apiName');
    console.log('$apiName: ', apiName);
    if(isCtrlPressed){
        let label = $(this).attr('data-label');
        console.log('$label: ', label);
        copyToCLipboard(label);
    }else{
        let recordsParam = {
            sessionId: sessionId,
            baseUrl: baseUrl,
            apiName: apiName
        };
        console.log('$recordsParam: ', recordsParam);
        openMaximized(`records.html?apiName=${apiName}&sessionId=${sessionId}&baseUrl=${baseUrl}&objectId=${objectNameAndIdMap.get(apiName)}`);
    }
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