let baseUrl = null;
let sessionId = null;

let records;
let recordsAll;
let csvArrayData;
let objectNameAndIdMap;
let metadataName = 'ApexClass';
let options = [
    { label: 'Flows', value: 'Flow' },
    { label: 'Profiles', value: 'Profile' },
    { label: 'Apex Classes', value: 'ApexClass' },
    { label: 'Custom Fields', value: 'CustomField' },
    { label: 'Custom Labels', value: 'CustomLabel' },
    { label: 'Custom Objects', value: 'CustomObject' },
    { label: 'Connected Apps', value: 'ConnectedApplication' },
    { label: 'Email Templates', value: 'EmailTemplate' },
    { label: 'Permission Sets', value: 'PermissionSet' },
    { label: 'Static Resources', value: 'StaticResource' },
    { label: 'Aura Components', value: 'AuraDefinitionBundle' },
    { label: 'Named Credential', value: 'NamedCredential' },
    { label: 'Visualforce Pages', value: 'ApexPage' },
    { label: 'Remote Site Settings', value: 'RemoteSiteSetting' },
    { label: 'Visualforce Components', value: 'ApexComponent' },
    { label: 'Lightning Web Components', value: 'LightningComponentBundle' },
];

$(document).ready(function () {
    Draggable.create('.small_popup');
    $('.small_popup').hide();
    $('.secure-div').hide();
    $('.outer').show();
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    setSessionText();
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    hideSpinner();
    createSelectOptions();
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


function fetchMetadatRecords() {
    $('.inp').val('');
    $('.tbody').html('<div></div>');

    if (metadataName == 'CustomObject' || metadataName == 'CustomField') {
        console.log('Checkpoint call custom Object');
        showSpinner();

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
                        <type>${metadataName}</type>
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
        })
            .then(response => response.text())
            .then(data => {
                console.log(data);
                let xmlResponse = data;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlResponse, "text/xml");

                let xmlParsedRecords = [];
                let recordNodes = xmlDoc.querySelectorAll('result');
                console.log('$recordNodes: ', recordNodes);
                let faultstring = xmlDoc.querySelector('faultstring');
                console.log('$faultstring: ', faultstring);
                if (faultstring) {
                    $('.snackbar').text(faultstring.textContent);
                    showToast();
                }
                recordNodes.forEach(recordNode => {
                    let fullName = recordNode.querySelector('fullName').textContent;
                    if (!(fullName.endsWith('__x') || fullName.endsWith('__c') || fullName.endsWith('__mdt') || fullName.endsWith('__e') || fullName.endsWith('__b'))) {
                        return;
                    }
                    let objectId = recordNode.querySelector('id')?.textContent ? recordNode.querySelector('id').textContent : fullName;
                    let xmlParsedRecord = {
                        Id: objectId,
                        Name: fullName,
                        Value: fullName,
                        LastModifiedDate: recordNode.querySelector('lastModifiedDate').textContent,
                        CreatedDate: recordNode.querySelector('createdDate').textContent,
                        CreatedBy: {
                            Name: recordNode.querySelector('createdByName').textContent
                        },
                        LastModifiedBy: {
                            Name: recordNode.querySelector('lastModifiedByName').textContent
                        }
                    }

                    xmlParsedRecords.push(xmlParsedRecord);
                });
                console.log('$xmlParsedRecords: ', xmlParsedRecords);
                records = [...xmlParsedRecords];
                sortRecords('Date Time (INDIA)', 'Asc');
                prepareMetadata();
            }).catch(error => {
                console.error('Error:', error);
            });
        if (metadataName == 'CustomField') {
            fetchObjectIds();
        }
    } else {
        showSpinner();
        console.log('$baseUrl: ', baseUrl);
        console.log('$sessionId: ', sessionId);
        console.log('$metadataName: ', metadataName);

        let query;

        if (metadataName === 'LightningComponentBundle' || metadataName === 'AuraDefinitionBundle') {
            query = 'SELECT Id,DeveloperName,LastModifiedDate,CreatedDate,CreatedBy.Name,LastModifiedBy.Name FROM ' + metadataName + ' ORDER BY LastModifiedDate DESC';
        } else if (metadataName === 'CustomLabel') {
            query = 'SELECT Id,Name,Value,LastModifiedDate,CreatedDate,CreatedBy.Name,LastModifiedBy.Name FROM ' + metadataName + ' ORDER BY LastModifiedDate DESC';
        } else if (metadataName === 'Flow') {
            query = 'SELECT Id,MasterLabel,LastModifiedDate,CreatedDate,CreatedBy.Name,LastModifiedBy.Name FROM ' + metadataName + ' Where Status = \'Active\' ORDER BY LastModifiedDate DESC';
        } else if (metadataName === 'RemoteSiteSetting') {
            query = 'SELECT Id,SiteName,EndpointUrl,LastModifiedDate,CreatedDate,CreatedBy.Name,LastModifiedBy.Name FROM ' + metadataName + ' ORDER BY LastModifiedDate DESC';
        } else if (metadataName === 'StaticResource') {
            query = 'SELECT Id,Name,ContentType,LastModifiedDate,CreatedDate,CreatedBy.Name,LastModifiedBy.Name FROM ' + metadataName + ' ORDER BY LastModifiedDate DESC';
        } else if (metadataName === 'NamedCredential') {
            query = 'SELECT Id,DeveloperName,MasterLabel,NamespacePrefix,CreatedDate,CreatedById,LastModifiedDate,LastModifiedById,Endpoint,LastModifiedBy.Name,CreatedBy.Name FROM NamedCredential ORDER BY LastModifiedDate DESC';
        } else if (metadataName === 'Profile') {
            query = 'SELECT Id,Name,LastModifiedDate,CreatedDate,CreatedBy.Name,LastModifiedBy.Name FROM ' + metadataName + ' ORDER BY LastModifiedDate DESC';
        } else {
            query = 'SELECT Id,Name,LastModifiedDate,CreatedDate,CreatedBy.Name,LastModifiedBy.Name FROM ' + metadataName + ' ORDER BY LastModifiedDate DESC';
        }

        const endpoint = `${baseUrl}/services/data/v59.0/tooling/query?q=${encodeURIComponent(query)}`;

        fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + sessionId,
            },
        }).then(response => response.json()).then(data => {
            console.log('$data: ', data);
            let result = data;
            console.log('$result: ', result);
            if (result && result[0] && result[0].message) {
                $('.snackbar').text(result[0].message);
                hideSpinner();
                showToast();
            } else {
                records = JSON.parse(JSON.stringify(result.records));
                console.log('$records: ', records);
                prepareMetadata();
            }
        }).catch(error => {
            console.error('Error:--', error);
        });
    }

}

$(document).on('click', '.close-icon', function (e) {
    hideSmallPopup();
});

$(document).on('click', '.comp-name', function (e) {
    $(this).find('.btns_div').removeClass('hide');
    $(this).find('.name_div').addClass('hide');
});
$(document).on('mouseleave', '.comp-name', function (e) {
    $(this).find('.btns_div').addClass('hide');
    $(this).find('.name_div').removeClass('hide');
});

$(document).on('click', '.CopyDuoBtn', function (e) {
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    if (metadataName == 'CustomLabel') {
        copyToCLipboard(value);
    } else if (metadataName == 'NamedCredential') {
        copyToCLipboard(fileName);
    } else if (metadataName == 'RemoteSiteSetting') {
        copyToCLipboard(value);
    }
});
$(document).on('click', '.EditBtn', function (e) {
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    if (metadataName == 'CustomLabel') {
        showSpinner();
        const endpoint = `${baseUrl}/services/data/v59.0/tooling/sobjects/${metadataName}/${recordId}`;
        fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + sessionId,
            },
        }).then(response => response.json()).then(data => {
            console.log(data);
            let res = data;
            console.log('$res: ', res);
            showSmallPopup();
            $('.small_popup_input_box').val(res.Value);
            $('.small_popup_input_box').attr('placeholder', '');
            $('.small_popup_input_box').attr('data-id', recordId);
            $('.small_popup_box_heading_div').text(res.Name);
            $('.small_popup_btn1').text('Copy');
            $('.small_popup_btn2').text('Update');
            $('.small_popup_btn2').attr('data-action', 'updatecustomlabel');
            hideSpinner();
        }).catch(error => {
            console.error('Error:', error);
        });
    }
});

$(document).on('contextmenu', '.CopyDuoBtn', function (e) {
    e.preventDefault();
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    if (metadataName == 'CustomLabel') {
        copyToCLipboard(fileName);
    } else if (metadataName == 'NamedCredential') {
        copyToCLipboard(value);
    } else if (metadataName == 'RemoteSiteSetting') {
        copyToCLipboard(fileName);
    }
});

$(document).on('click', '.OpenBtn', function (e) {
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    if (metadataName == 'Flow') {
        window.open(baseUrl + '/builder_platform_interaction/flowBuilder.app?flowId=' + recordId, '_blank');
    } else if (metadataName == 'Profile') {
        window.open(baseUrl + '/lightning/setup/EnhancedProfiles/page?address=/' + recordId, '_blank');
    } else if (metadataName == 'Profile') {
        window.open(baseUrl + '/lightning/setup/EnhancedProfiles/page?address=/' + recordId, '_blank');
    } else if (metadataName == 'CustomObject') {
        if (fileName.endsWith('__mdt')) {
            window.open(baseUrl + '/lightning/setup/CustomMetadata/page?address=/' + recordId + '?setupid=CustomMetadata', '_blank');
        } else {
            window.open(baseUrl + '/lightning/setup/ObjectManager/' + recordId + '/FieldsAndRelationships/view', '_blank');
        }
    } else if (metadataName == 'ConnectedApplication') {
        window.open(baseUrl + '/02u');
    } else if (metadataName == 'CustomLabel') {
        window.open(baseUrl + '/lightning/setup/ExternalStrings/page?address=/' + recordId);
    } else if (metadataName == 'AuraDefinitionBundle') {
        window.open(baseUrl + '/lightning/setup/LightningComponentBundles/page?address=/' + recordId);
    } else if (metadataName == 'RemoteSiteSetting') {
        window.open(baseUrl + '/lightning/setup/SecurityRemoteProxy/page?address=/' + recordId);
    } else if (metadataName == 'PermissionSet') {
        window.open(baseUrl + '/lightning/setup/PermSets/page?address=/' + recordId, '_blank');
    } else if (metadataName == 'StaticResource') {
        window.open(baseUrl + '/lightning/setup/StaticResources/page?address=/' + recordId, '_blank');
    } else if (metadataName == 'NamedCredential') {
        window.open(baseUrl + '/lightning/setup/NamedCredential/page?address=/' + recordId + '?retURL=//lightning//Fsetup/NamedCredential//home', '_blank');
    } else if (metadataName == 'CustomField') {
        let objectAPIName = fileName.split('.')[0];
        let objectID = objectNameAndIdMap.get(objectAPIName);
        console.log('$objectID: ', objectID);
        if (objectAPIName.endsWith('__mdt')) {
            window.open(baseUrl + '/lightning/setup/CustomMetadata/page?address=/' + recordId + '?setupid=CustomMetadata', '_blank');
        } else {
            window.open(baseUrl + '/lightning/setup/ObjectManager/' + objectID + '/FieldsAndRelationships/' + recordId + '/view', '_blank');
        }
    }
});
$(document).on('click', '.ViewBtn', function (e) {
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    if (metadataName == 'LightningComponentBundle') {
        openMaximized(`lwc.html?recordId=${recordId}&sessionId=${sessionId}&baseUrl=${baseUrl}&Name=${fileName}`);
    }else if (metadataName == 'ApexClass') {
        openMaximized(`code_apex.html?recordId=${recordId}&sessionId=${sessionId}&baseUrl=${baseUrl}&Name=${fileName}`);
    } else if (metadataName == 'ApexPage' || metadataName == 'ApexComponent') {
        openMaximized(`markup.html?recordId=${recordId}&sessionId=${sessionId}&baseUrl=${baseUrl}&Name=${fileName}&metadataName=${metadataName}&langClass=language-html`);
    } else if (metadataName == 'EmailTemplate') {
        openMaximized(`markup.html?recordId=${recordId}&sessionId=${sessionId}&baseUrl=${baseUrl}&Name=${fileName}&metadataName=${metadataName}&langClass=language-html`);
    }
});
$(document).on('click', '.DownloadBtn', function (e) {
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    if (metadataName == 'LightningComponentBundle') {
        showSpinner();
        var myHeaders = new Headers();
        myHeaders.append("Authorization", "Bearer " + sessionId);

        var requestOptions = {
            method: 'GET',
            headers: myHeaders,
            redirect: 'follow'
        };
        let endpoint = baseUrl + '/services/data/v59.0/tooling/query/?q=SELECT+Id,LightningComponentBundleId,LightningComponentBundle.DeveloperName,LightningComponentBundle.ApiVersion,FilePath,Format,Source+FROM+LightningComponentResource+WHERE+LightningComponentBundleId+=+\'' + recordId + '\'';
        fetch(endpoint, requestOptions).then(response => response.json()).then(resources => {
            console.log('$resources: ', resources);
            let resourceFIles = [];
            resources.records.forEach(val => {
                resourceFIles.push(
                    {
                        FilePath: val.FilePath.split('/')[2],
                        Source: val.Source
                    }
                );
            });
            console.log('$resourceFIles: ', resourceFIles);
            var zip = new JSZip();
            resourceFIles.forEach(val => {
                zip.file(val.FilePath, val.Source);
            });
            zip.generateAsync({ type: "blob" }).then(function (content) {
                saveAs(content, fileName + '.zip');
                hideSpinner();
            });
        }).catch(error => {
            console.log('$getObjects: error', error);
        });
    } else if (metadataName == 'ApexClass') {
        showSpinner();
        const endpoint = `${baseUrl}/services/data/v59.0/tooling/sobjects/ApexClass/${recordId}`;
        fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + sessionId,
            },
        }).then(response => response.json()).then(resource => {
            console.log('$resource: ', resource);
            var blob = new Blob([resource.Body], { type: 'text/plain' });
            saveAs(blob, resource.FullName + '.cls');
            hideSpinner();
        }).catch(error => {
            console.error('Error:', error);
        });
    } else if (metadataName == 'ApexPage' || metadataName == 'ApexComponent') {
        showSpinner();
        var myHeaders = new Headers();
        myHeaders.append("Authorization", "Bearer " + sessionId);

        var requestOptions = {
            method: 'GET',
            headers: myHeaders,
            redirect: 'follow'
        };

        fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/' + metadataName + '/' + recordId, requestOptions).then(response => response.json()).then(resource => {
            console.log('$resource: ', resource);
            var blob = new Blob([resource.Markup], { type: 'text/plain' });
            saveAs(blob, (resource?.FullName ?? resource?.Name) + '.html');
            hideSpinner();
        }).catch(error => {
            console.log('$getObjects: error', error);
        });
    } else if (metadataName == 'StaticResource') {
        let staticRecord = records.find(st => {
            return st.Id == recordId;
        });
        console.log('$staticRecord: ', staticRecord);
        showSpinner();
        var myHeaders = new Headers();
        myHeaders.append("Authorization", "Bearer " + sessionId);
        var requestOptions = {
            method: 'GET',
            headers: myHeaders,
            redirect: 'follow'
        };
        fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/StaticResource/' + recordId + '/Body', requestOptions).then(response => response.blob()).then(blob => {
            console.log('$blob : ', blob);
            let mimeTypeExtensionMap = new Map();
            mimeTypeExtensionMap.set('application/zip', '.zip');
            mimeTypeExtensionMap.set('application/x-zip-compressed', '.zip');
            mimeTypeExtensionMap.set('image/jpeg', '.jpg');
            mimeTypeExtensionMap.set('application/pdf', '.pdf');
            mimeTypeExtensionMap.set('image/png', '.png');
            mimeTypeExtensionMap.set('text/javascript', '.js');
            mimeTypeExtensionMap.set('text/css', '.css');
            mimeTypeExtensionMap.set('application/x-javascript', '.js');
            mimeTypeExtensionMap.set('image/x-icon', '.ico');
            mimeTypeExtensionMap.set('text/plain', '.txt');
            mimeTypeExtensionMap.set('text', '.txt');
            mimeTypeExtensionMap.set('video/mp4', '.mp4');
            mimeTypeExtensionMap.set('image/svg+xml', '.svg');
            mimeTypeExtensionMap.set('image/webp', '.webp');
            mimeTypeExtensionMap.set('image/gif', '.gif');
            console.log(mimeTypeExtensionMap);
            saveAs(blob, fileName + mimeTypeExtensionMap.get(staticRecord.ContentType));
            hideSpinner();
        }).catch(error => {
            console.log('$getObjects: error', error);
        });
    } else if (metadataName == 'EmailTemplate') {
        showSpinner();
        var myHeaders = new Headers();
        myHeaders.append("Authorization", "Bearer " + sessionId);

        var requestOptions = {
            method: 'GET',
            headers: myHeaders,
            redirect: 'follow'
        };

        fetch(baseUrl + '/services/data/v59.0/sobjects/' + metadataName + '/' + recordId, requestOptions).then(response => response.json()).then(resource => {
            console.log('$resource: ', resource);
            var blob = new Blob([resource.Markup], { type: 'text/plain' });
            saveAs(blob, resource.DeveloperName + '.html');
            hideSpinner();
        }).catch(error => {
            console.log('$getObjects: error', error);
        });
    }
});
$(document).on('click', '.CopyBtn', function (e) {
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    if (metadataName == 'EmailTemplate') {
        showSpinner();
        var myHeaders = new Headers();
        myHeaders.append("Authorization", "Bearer " + sessionId);
        var requestOptions = {
            method: 'GET',
            headers: myHeaders,
            redirect: 'follow'
        };
        fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/' + metadataName + '/' + recordId, requestOptions).then(response => response.json()).then(resource => {
            console.log('$API: ', resource);
            console.log('$resource: ', resource);
            copyToCLipboard(resource.FullName);
            hideSpinner();
        }).catch(error => {
            console.log('$getObjects: error', error);
        });
    } else {
        copyToCLipboard(fileName);
    }
});

$(document).on('click', '.CopyOpenBtn', function (e){
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    if (metadataName == 'EmailTemplate') {
        showSpinner();
        var myHeaders = new Headers();
        myHeaders.append("Authorization", "Bearer " + sessionId);
        var requestOptions = {
            method: 'GET',
            headers: myHeaders,
            redirect: 'follow'
        };
        fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/' + metadataName + '/' + recordId, requestOptions).then(response => response.json()).then(resource => {
            console.log('$API: ', resource);
            console.log('$resource: ', resource);
            copyToCLipboard(resource.FullName);
            hideSpinner();
        }).catch(error => {
            console.log('$getObjects: error', error);
        });
    }
});

$(document).on('contextmenu', '.CopyOpenBtn', function (e){
   e.preventDefault();
   let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);
    window.open(baseUrl + '/' + recordId, '_blank');
});
$(document).on('click', '.download-btn', function(e) {
    console.log('Checkpoint download-btn');
    console.log('$csvArrayData: ',csvArrayData);

    const csvContent = csvArrayData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8'
    });
    saveAs(blob, metadataName + '_List.csv');
});
function generateTable() {
    let rows = '';
    let total_length = 0;
    csvArrayData = [['NAME', 'LAST MODIFIED BY', 'DATETIME(INDIA)','DATETIME(USA)','CREATED BY','CREATED DATE']];
    records.forEach(val => {
        if (!val.LastModifiedBy) return;
        total_length++;
        let date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(val.LastModifiedDate));
        date_time = date_time.replaceAll(',', '').toUpperCase().split(' ').join(' ');

        let created_date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(val.CreatedDate));
        created_date_time = created_date_time.replaceAll(',', '').toUpperCase().split(' ').join(' ');
        let date_time_us = Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(val.LastModifiedDate));
        date_time_us = date_time_us.replaceAll(',', '').toUpperCase().split(' ').join(' ');

        let Name = val.Name ? val.Name : val.DeveloperName;
        let Value = val.Value ? val.Value : '';

        if (metadataName == 'CustomField') {
            val.title = Name;
        }
        let btn1Name = 'View';
        let btn1Class = 'ViewBtn';
        let btn2Name = 'Copy';
        let btn2Class = 'CopyBtn';
        let btn3Name = 'Download';
        let btn3Class = 'DownloadBtn';

        if (metadataName == 'Flow' || metadataName == 'Profile' || metadataName == 'CustomObject' || metadataName == 'CustomField' || metadataName == 'ConnectedApplication' || metadataName == 'PermissionSet' || metadataName == 'AuraDefinitionBundle') {
            btn1Name = 'Cancel';
            btn1Class = 'CancelBtn';
            btn2Name = 'Copy';
            btn2Class = 'CopyBtn';
            btn3Name = 'Open';
            btn3Class = 'OpenBtn';
        }
        if (metadataName == 'CustomLabel') {
            btn1Name = 'Open';
            btn1Class = 'OpenBtn';
            btn2Name = 'Copy Name / Value';
            btn2Class = 'CopyDuoBtn';
            btn3Name = 'Edit';
            btn3Class = 'EditBtn';
        }

        if (metadataName == 'NamedCredential') {
            btn1Name = 'Cancel';
            btn1Class = 'CancelBtn';
            btn2Name = 'Copy Name / Value';
            btn2Class = 'CopyDuoBtn';
            btn3Name = 'Open';
            btn3Class = 'OpenBtn';
        }

        if (metadataName == 'StaticResource') {
            btn1Name = 'Open';
            btn1Class = 'OpenBtn';
            btn2Name = 'Copy';
            btn2Class = 'CopyBtn';
            btn3Name = 'Download';
            btn3Class = 'DownloadBtn';
        }

        if (metadataName == 'RemoteSiteSetting') {
            btn1Name = 'Cancel';
            btn1Class = 'CancelBtn';
            btn2Name = 'Copy Value / Name';
            btn2Class = 'CopyDuoBtn';
            btn3Name = 'Open';
            btn3Class = 'OpenBtn';
        }

        if (metadataName == 'EmailTemplate') {
            btn1Name = 'View';
            btn1Class = 'ViewBtn';
            btn2Name = 'Copy / Open';
            btn2Class = 'CopyOpenBtn';
            btn3Name = 'Download';
            btn3Class = 'DownloadBtn';
        }

        let btnTag = `
            <div class="btns_div td_div hide">
                <div class="dv_b dv_b_1">
                    <button class="dv_btn dv_btn1 ${btn1Class}" data-id="${val.Id}" data-name="${Name}" data-value="${Value}" title="${val.title}">${btn1Name}</button>
                </div>
                <div class="dv_b dv_b_2">
                    <button class="dv_btn dv_btn2 ${btn2Class}" data-id="${val.Id}" data-name="${Name}" data-value="${Value}" title="${val.title}">${btn2Name}</button>
                </div>
                <div class="dv_b dv_b_3">
                    <button class="dv_btn dv_btn3 ${btn3Class}" data-id="${val.Id}" data-name="${Name}" data-value="${Value}" title="${val.title}">${btn3Name}</button>
                </div>
            </div>
        `;
        let nameTag = `<div class="name_div">${Name}</div>`;
        let combinedTag = btnTag + nameTag;
        rows += `<tr class="tr">
            <td class="td comp-name"><div class="tdContainerD" data-id="${val.Id}" data-name="${Name}" data-value="${Value}" title="${val.title}">${combinedTag}</div></td>
            <td class="td" data-id="${val.Id}">${val.LastModifiedBy.Name}</td>
            <td class="td" data-id="${val.Id}">${date_time}</td>
            <td class="td" data-id="${val.Id}">${date_time_us}</td>
            <td class="td" data-id="${val.Id}">${val?.CreatedBy?.Name}</td>
            <td class="td" data-id="${val.Id}">${created_date_time}</td>
        </tr>`;
        csvArrayData.push([checknull(Name), checknull(val?.LastModifiedBy?.Name), checknull(date_time), checknull(date_time_us), checknull(val?.CreatedBy?.Name), checknull(created_date_time)]);
    });

    $('.tbody').html(rows);
    let option = options.find(element => {
        return element.value == metadataName;
    });
    $('.chng-session').text('TOTAL [ ' + total_length + ' ]');
    hideSpinner();
}

function checknull(val){
    return val == null ? '' : val.replaceAll(',','-');
}

$(document).on('input', '.inp', function (e) {
    let search = $(this).attr('data-search');
    let search_text = $(this).val().trim();
    console.log('$search_text: ', search_text);
    console.log('$search: ', search);
    if (search == 'metadata-name') {
        console.log('Checkpoint 1');
        let recs = recordsAll.filter(rec => {
            return rec.Name.toLowerCase().includes(search_text.toLowerCase());
        });
        console.log('$recs: ', recs);
        records = [...recs];
        generateTable();
    } else if (search == 'modifiedby-name') {
        console.log('Checkpoint 2');
        let recs = recordsAll.filter(rec => {
            return rec.LastModifiedBy.Name.toLowerCase().includes(search_text.toLowerCase());
        });
        console.log('$recs: ', recs);
        records = [...recs];
        generateTable();
    } else if (search == 'createdby-name') {
        console.log('Checkpoint 3');
        let recs = recordsAll.filter(rec => {
            return rec?.CreatedBy?.Name.toLowerCase().includes(search_text.toLowerCase());
        });
        console.log('$recs: ', recs);
        records = [...recs];
        generateTable();
    }
});

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
    }).then(response => response.text()).then(data => {
        console.log(data);
        let xmlResponse = data;
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

function prepareMetadata() {
    records.forEach(val => {
        if (val.DeveloperName) {
            val.Name = val.DeveloperName;
        }
        if (!val.LastModifiedBy) {
            val.LastModifiedBy = val.CreatedBy;
        }
        if (metadataName == 'Flow') {
            val.Name = val.MasterLabel;
        } else if (metadataName == 'RemoteSiteSetting') {
            val.Name = val.SiteName;
            val.Value = val.EndpointUrl;
        } else if (metadataName == 'NamedCredential') {
            val.Name = val.DeveloperName;
            val.Value = val.Endpoint ?? '-';
        }
        val.title = val.ContentType ? val.ContentType : '';
    });
    recordsAll = [...records];
    generateTable();
}

function createSelectOptions() {
    let option_tags = '';
    options.forEach(val => {
        if (metadataName == val.value) {
            option_tags += `<option class="option ${val.value}" value="${val.value}" selected>${val.label}</option>`;
        } else {
            option_tags += `<option class="option ${val.value}" value="${val.value}">${val.label}</option>`;
        }
    });
    $('.select').html(option_tags);
}

$(document).on('click', '.th', function (e) {
    let th = $(this).attr('data-id');
    var icon = $(this).find("i");
    if (icon.hasClass("fa-angle-down")) {
        icon.removeClass("fa-angle-down").addClass("fa-angle-up");
        sortRecords(th, 'Asc');
    } else if (icon.hasClass("fa-angle-up")) {
        icon.removeClass("fa-angle-up").addClass("fa-angle-down");
        sortRecords(th, 'Desc');
    }
});

function sortRecords(th, order) {
    if (th == 'Name' && order == 'Asc') {
        records.sort((a, b) => {
            if (a.Name) {
                return a.Name.localeCompare(b.Name);
            } else {
                return a.DeveloperName.localeCompare(b.DeveloperName);
            }
        });
    } else if (th == 'Name' && order == 'Desc') {
        records.sort((b, a) => {
            if (a.Name) {
                return a.Name.localeCompare(b.Name);
            } else {
                return a.DeveloperName.localeCompare(b.DeveloperName);
            }
        });
    } else if (th == 'Las Modified By' && order == 'Asc') {
        records.sort((a, b) => {
            return a.LastModifiedBy.Name.localeCompare(b.LastModifiedBy.Name);
        });
    } else if (th == 'Las Modified By' && order == 'Desc') {
        records.sort((b, a) => {
            return a.LastModifiedBy.Name.localeCompare(b.LastModifiedBy.Name);
        });
    } else if (th == 'Created By' && order == 'Asc') {
        records.sort((a, b) => {
            return a?.CreatedBy?.Name.localeCompare(b?.CreatedBy?.Name);
        });
    } else if (th == 'Created By' && order == 'Desc') {
        records.sort((b, a) => {
            return a?.CreatedBy?.Name.localeCompare(b?.CreatedBy?.Name);
        });
    } else if ((th == 'Date Time (INDIA)' || th == 'Date Time (USA)') && order == 'Asc') {
        records.sort((a, b) => {
            const dateA = new Date(a.LastModifiedDate);
            const dateB = new Date(b.LastModifiedDate);
            return dateB - dateA;
        });
    } else if ((th == 'Date Time (INDIA)' || th == 'Date Time (USA)') && order == 'Desc') {
        records.sort((a, b) => {
            const dateA = new Date(a.LastModifiedDate);
            const dateB = new Date(b.LastModifiedDate);
            return dateA - dateB;
        });
    } else if (th == 'Created Date' && order == 'Asc') {
        records.sort((a, b) => {
            const dateA = new Date(a.CreatedDate);
            const dateB = new Date(b.CreatedDate);
            return dateB - dateA;
        });
    } else if (th == 'Created Date' && order == 'Desc') {
        records.sort((a, b) => {
            const dateA = new Date(a.CreatedDate);
            const dateB = new Date(b.CreatedDate);
            return dateA - dateB;
        });
    }
    generateTable();
}

$(document).on('change', '.select', function (e) {
    let select_value = $(this).val();
    metadataName = select_value;
    sessionStorage.setItem('metadataName', metadataName);
    fetchMetadatRecords();
});

$(document).on('contextmenu', '.tdContainerD1', function (e) {
    e.preventDefault();
    let recordId = $(this).attr('data-id');
    let fileName = $(this).attr('data-name');
    let value = $(this).attr('data-value');
    console.log('$recordId: ', recordId);
    console.log('$fileName: ', fileName);
    console.log('$value: ', value);

    if (metadataName == 'StaticResource') {
        let staticRecord = records.find(st => {
            return st.Id == recordId;
        });
        console.log('$staticRecord: ', staticRecord);
        // copyToCLipboard(fileName);
        // window.open(baseUrl + '/lightning/setup/StaticResources/page?address=/' + recordId, '_blank');
        let divTag = `
            <div class="td_div">
                <div class="dv_b dv_b_1">
                    <button class="dv_btn dv_btn1">View</button>
                </div>
                <div class="dv_b dv_b_2">
                    <button class="dv_btn dv_btn2">Download</button>
                </div>
                <div class="dv_b dv_b_3">
                    <button class="dv_btn dv_btn3">Cancel</button>
                </div>
            </div>
        `;
    } else if (metadataName == 'ApexClass') {
        showSpinner();

        const endpoint = `${baseUrl}/services/data/v59.0/tooling/sobjects/ApexClass/${recordId}`;

        fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + sessionId,
            },
        }).then(response => response.json()).then(data => {
            console.log(data);
            let resource = data;
            console.log('$resource: ', resource);
            downloadSingleFile(resource.FullName + '.cls', resource.Body);
            hideSpinner();
        }).catch(error => {
            console.error('Error:', error);
        });
    } else if (metadataName == 'Profile') {
        window.open(baseUrl + '/lightning/setup/EnhancedProfiles/page?address=/' + recordId, '_blank');
    } else if (metadataName == 'PermissionSet') {
        window.open(baseUrl + '/lightning/setup/PermSets/page?address=/' + recordId, '_blank');
    } else if (metadataName == 'RemoteSiteSetting') {
        showSmallPopup();
        $('.small_popup_input_box').val('');
        $('.small_popup_input_box').attr('placeholder', 'NAME  ::  URL');
        $('.small_popup_box_heading_div').text('Add New Remote Site Setting');
        $('.small_popup_btn1').text('Close');
        $('.small_popup_btn2').text('Create');
        $('.small_popup_btn2').attr('data-action', 'createremotesitesetting');

    } else if (metadataName == 'NamedCredential') {
        copyToCLipboard(value);
    } else if (metadataName == 'CustomObject') {
        if (fileName.endsWith('__mdt')) {
            window.open(baseUrl + '/lightning/setup/CustomMetadata/page?address=/' + recordId + '?setupid=CustomMetadata', '_blank');
        } else {
            window.open(baseUrl + '/lightning/setup/ObjectManager/' + recordId + '/FieldsAndRelationships/view', '_blank');
        }
    } else if (metadataName == 'ConnectedApplication') {
        window.open(baseUrl + '/02u');
    } else if (metadataName == 'CustomField') {
        let objectAPIName = fileName.split('.')[0];
        let objectID = objectNameAndIdMap.get(objectAPIName);
        console.log('$objectID: ', objectID);
        if (objectAPIName.endsWith('__mdt')) {
            window.open(baseUrl + '/lightning/setup/CustomMetadata/page?address=/' + recordId + '?setupid=CustomMetadata', '_blank');
        } else {
            window.open(baseUrl + '/lightning/setup/ObjectManager/' + objectID + '/FieldsAndRelationships/' + recordId + '/view', '_blank');
        }
    } else if (metadataName == 'CustomLabel') {
        showSpinner();
        const endpoint = `${baseUrl}/services/data/v59.0/tooling/sobjects/${metadataName}/${recordId}`;
        fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + sessionId,
            },
        }).then(response => response.json()).then(data => {
            console.log(data);
            let res = data;
            console.log('$res: ', res);
            showSmallPopup();
            $('.small_popup_input_box').val(res.Value);
            $('.small_popup_input_box').attr('placeholder', '');
            $('.small_popup_input_box').attr('data-id', recordId);
            $('.small_popup_box_heading_div').text(res.Name);
            $('.small_popup_btn1').text('Copy');
            $('.small_popup_btn2').text('Update');
            $('.small_popup_btn2').attr('data-action', 'updatecustomlabel');
            hideSpinner();
        }).catch(error => {
            console.error('Error:', error);
        });

    } else if (metadataName == 'EmailTemplate') {
        showSpinner();
        var myHeaders = new Headers();
        myHeaders.append("Authorization", "Bearer " + sessionId);

        var requestOptions = {
            method: 'GET',
            headers: myHeaders,
            redirect: 'follow'
        };

        fetch(baseUrl + '/services/data/v59.0/tooling/sobjects/' + metadataName + '/' + recordId, requestOptions).then(response => response.json()).then(resource => {
            console.log('$API: ', resource);
            console.log('$resource: ', resource);
            copyToCLipboard(resource.FullName);
            hideSpinner();
        }).catch(error => {
            console.log('$getObjects: error', error);
        });
    } else if (metadataName == 'ApexComponent' || metadataName == 'AuraDefinitionBundle' || metadataName == 'ApexPage') {
        copyToCLipboard(fileName);
    } else if (metadataName == 'Flow') {
        window.open(baseUrl + '/builder_platform_interaction/flowBuilder.app?flowId=' + recordId, '_blank');
    }
});

$(document).on('click', '.small_popup_btn1', function (e) {
    if ($(this).text().trim() == 'Close') {
        hideSmallPopup();
    }
    else {
        copyToCLipboard($('.small_popup_input_box').val().trim());
    }
});

$(document).on('click', '.small_popup_box_heading_div', function (e) {
    copyToCLipboard($(this).text().trim());
});

$(document).on('click', '.small_popup_btn2', function (e) {

    let action = $(this).attr('data-action');
    console.log('$action: ', action);
    if (action == 'updatecustomlabel') {
        console.log('Checkpoint else');
        let value = $('.small_popup_input_box').val().trim();
        let recordId = $('.small_popup_input_box').attr('data-id');
        console.log('$value: ', value);
        console.log('$recordId: ', recordId);
        showSpinner();
        const endpoint = `${baseUrl}/services/data/v59.0/tooling/sobjects/CustomLabel/${recordId}`;
        fetch(endpoint, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionId,
            },
            body: JSON.stringify({ Value: value }),
        }).then(response => {
            console.log('$response: ', response);
            if (response.ok) {
                hideSpinner();
                $('.snackbar').text('Updated.');
                showToast();
            }
        }).then(data => {
            console.log(data);
        }).catch(error => {
            console.error('Error:', error);
        });

    }
});

function hideSmallPopup() {
    $('.small_popup').hide();
    $('.outer').removeClass('blur');
}

function showSmallPopup() {
    $('.outer').addClass('blur');
    $('.small_popup').show();
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

function downloadSingleFile(fileName, fileData) {
    var blob = new Blob([fileData], { type: 'text/plain' });
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    hideSpinner();
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

function copyToCLipboard(value, hideSnackbar) {
    let text = value;
    navigator.clipboard.writeText(text).then(function () {
        console.log('copied : ' + text);
        $('.snackbar').text(text);
        if (!hideSnackbar)
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