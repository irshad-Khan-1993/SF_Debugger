
let fields;
let fieldsAll;

let baseUrl = null;
let sessionId = null;

let objectID;
let objectAPIName;
let fieldApiNameAndIdMap;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    objectAPIName = url.searchParams.get('apiName');
    console.log('$objectAPIName: ', objectAPIName);
    copyToCLipboardWithoutToast(objectAPIName);
    objectID = url.searchParams.get('objectId');
    console.log('$objectID: ', objectID);
    hideSpinner();
    fetchMetadatRecords();
});

function copyToCLipboardWithoutToast(value) {
    let text = value;
    navigator.clipboard.writeText(text).then(function () {
        console.log('copied : ' + text);
        document.title = 'Fields - ' + text;
    }, function (err) {
        console.error('error copying');
    });
}

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

    fetch(baseUrl + '/services/data/v59.0/sobjects/' + objectAPIName + '/describe', requestOptions).then(response => response.json()).then(schemaResponse => {
        console.log('$schemaResponse: ', schemaResponse)
        console.log('$schemaResponse: ', schemaResponse);
        fields = schemaResponse.fields;
        console.log('$fields: ', fields);
        fields.forEach(val => {
            val.custom = val.custom ? 'Custom' : 'Standard';
            val.type = val.calculated ? 'Formula' : val.type;
            if(val.type == 'reference'){
                let masterLookupLabel = val.nillable ? 'Lookup' : 'Master';
                masterLookupLabel = 'Reference'
                val.type = `${masterLookupLabel} : ${val?.referenceTo[0]}`;
                val.extraClass = 'cls-reference';
            }
        });
        fields.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });
        fieldsAll = [...fields];
        console.log('$fields: ', fields);
        console.log('$$fieldsAll: ', fieldsAll);
        generateTable();
        fetchFieldIds();
        hideSpinner();
    }).catch(error => {
        console.log('$getObjects: error', error)
    });

}

function fetchFieldIds() {
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
                        <type>CustomField</type>
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
    }).then(response => response.text()).then(xmlResponseF => {
        fieldApiNameAndIdMap = new Map();
        console.log('$xmlResponseF: ', xmlResponseF);
        const parser = new DOMParser();
        const xmlDocF = parser.parseFromString(xmlResponseF, "text/xml");

        let recordNodes = xmlDocF.querySelectorAll('result');
        let customFieldAndId = new Map();
        for (let i = 0; i < recordNodes.length; i++) {
            let fullName = recordNodes[i].querySelector('fullName').textContent.split('.')[1];
            let fieldID = recordNodes[i].querySelector('id')?.textContent ? recordNodes[i].querySelector('id').textContent : fullName;
            customFieldAndId.set(fullName, fieldID);
        }
        console.log('$customFieldAndId: ', customFieldAndId);
        fieldsAll.forEach(field => {
            if (customFieldAndId.has(field.name)) {
                fieldApiNameAndIdMap.set(field.name, customFieldAndId.get(field.name));
            } else {
                fieldApiNameAndIdMap.set(field.name, field.name);
            }
        });
        console.log('$fieldApiNameAndIdMap: ', fieldApiNameAndIdMap);

    }).catch(error => {
        console.error('Error:', error);
    });
}

function generateTable() {
    let rows = '';
    let total = 0;
    fields.forEach(val => {
        total++;
        rows += `<tr class="tr">
            <td class="td td-attr type-label" data-apiName="${val.name}" data-label="${val.label}">${val.label}</td>
            <td class="td td-attr apiname-td" data-apiName="${val.name}">${val.name}</td>
            <td class="td td-attr type-td ${val.extraClass}" data-apiName="${val.name}" data-type="${val.type}">${val.type}</td>
            <td class="td td-attr" data-apiName="${val.name}">${val.custom}</td>
        </tr>`;
    });

    $('.tbody').html(rows);
    $('.total').text('TOTAL [ ' + total + ' ]');
}

$(document).on('input', '.inp', function (e) {
    let search = $(this).attr('data-search');
    let search_text = $(this).val().trim();
    console.log('$search_text: ', search_text);
    console.log('$search: ', search);
    let recs = fieldsAll.filter(rec => {
        return rec[search].toLowerCase().includes(search_text.toLowerCase());
    });
    console.log('$recs: ', recs);
    fields = [...recs];
    generateTable();
});

$(document).on('click', '.sb-top', function (e) {
    showHidePopup();
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
    console.log('$th: ', th);
    console.log('$order: ', order);
    console.log('$fields: ', fields);
    if (order == 'Asc') {
        fields.sort((a, b) => {
            return a[th].localeCompare(b[th]);
        });
    } else if (order == 'Desc') {
        fields.sort((b, a) => {
            return a[th].localeCompare(b[th]);
        });
    }
    console.log('$fields: ', fields);
    generateTable();
}

$(document).on('contextmenu', '.td-attr', function (e) {
    e.preventDefault();
    let apiName = $(this).attr('data-apiName');
    console.log('$apiName: ', apiName);
    console.log('$objectID: ', objectID);
    let fieldID = fieldApiNameAndIdMap.get(apiName);
    console.log('$fieldID: ', fieldID);
    console.log('$objectAPIName: ', objectAPIName);
    if (objectAPIName.endsWith('__mdt')) {
        window.open(baseUrl + '/lightning/setup/CustomMetadata/page?address=/' + fieldID + '?setupid=CustomMetadata', '_blank');
    } else {
        window.open(baseUrl + '/lightning/setup/ObjectManager/' + objectID + '/FieldsAndRelationships/' + fieldID + '/view', '_blank');
    }
});
let fieldsArray = [];
$(document).on('click', '.apiname-td', function (e) {
    let apiName = $(this).attr('data-apiName');
    $('.snackbar').text(apiName);
    copyToCLipboard(apiName);
    if(!fieldsArray.includes(apiName))
        fieldsArray.push(apiName);
    console.log('$fieldsArray: ',fieldsArray);
});
$(document).on('click', '.type-label', function (e) {
    let dataLabel = $(this).attr('data-label');
    $('.snackbar').text(dataLabel);
    copyToCLipboard(dataLabel);
});
$(document).on('click', '.btd', function (e) {
    let button_label = $(this).text().trim();
    $('.snackbar').text(button_label);
    copyToCLipboard(button_label);
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
$(document).on('click', '.type-td', function (e) {
    let apiName = $(this).attr('data-apiName');
    let dataType = $(this).attr('data-type');
    console.log('$apiName: ', apiName);
    console.log('$dataType: ', dataType);
    if(dataType.includes(':')){
        console.log('$dataType-has: ',dataType);
        let objNm = dataType.split(':')[1].trim();
        console.log('$objNm: ',objNm);
        openMaximized(`fields.html?apiName=${objNm}&sessionId=${sessionId}&baseUrl=${baseUrl}&objectId=${objectID}`);
    }
    if (dataType == 'picklist' || dataType == 'picklist*' || dataType == 'multipicklist' || dataType == 'multipicklist*') {
        let field = fields.find(f => {
            return f.name == apiName;
        });
        console.log('$field: ', field);
        console.log('$picklistValues: ', field.picklistValues);
        let rows = '';
        field.picklistValues.forEach(val => {
            val.defaultValue = val.defaultValue ? 'TRUE' : 'FALSE';
            val.active = val.active ? 'ACTIVE' : 'INACTIVE';
            rows += `<tr class="btrv">
                <td class="btd">
                    ${val.label}
                </td>
                <td class="btd">
                    ${val.value}
                </td>
                <td class="btd">
                    ${val.active}
                </td>
                <td class="btd">
                    ${val.defaultValue}
                </td>
            </tr>`;
        });
        $('.btb').html(rows);
        $('.sb-top').text('Picklist [ ' + apiName + ' ]');
        showHidePopup();
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