let baseUrl = null;
let sessionId = null;
let sobjectsAll = null;
let fieldsAll = null;
let recordsAll = null;
let selectedObject;
let selectedFieldsArray;
let fieldsMap;
let recordsSaveMap = new Map();
$(document).ready(function() {
    $(".spinner-div").hide();
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    getObjects();
});

async function getObjects() {
    showSpinner();
    let apiResponse = await getObjectsFromServer();
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$data: ', data);
    if (data) {
        sobjectsAll = [...data.sobjects];
        console.log('$sobjectsAll: ', sobjectsAll);
        prepareSObjectsDropdown('');
        $('.c_top_dv_inp_object').removeAttr('disabled');
        hideSpinner();
    }
}

function prepareSObjectsDropdown(filterValue) {
    let selectOptions = '`<option value="None">--None--</option>`';
    sobjectsAll.forEach(val => {
        if (filterValue) {
            if (val.name.toLowerCase().includes(filterValue.toLowerCase())) {
                selectOptions += `<option value="${val.name}">${val.name}</option>`
            }
        } else {
            selectOptions += `<option value="${val.name}">${val.name}</option>`
        }
    });
    if (!selectOptions) {
        selectOptions = `<option value="--No Objects--">--No Objects--</option>`;
    }
    $('.c_top_dv_select_object').html(selectOptions);
    selectedFieldsArray = [];
}

$(document).on('change', '.c_top_dv_select_object', function(e) {
    let val = $(this).val();
    if (val != 'None') {
        $('.c_top_dv_inp_object').val(val);
        handlePostObjectChosen(val);
    }
});

$(document).on('input', '.c_top_dv_inp_object', function(e) {
    let val = $(this).val().trim();
    console.log('val: ', val);

    let field = sobjectsAll.find(f => {
        return f.name.toLowerCase() == val.toLowerCase();
    });

    if (field) {
        $(this).val(field.name)
    }

    prepareSObjectsDropdown(val);
});

$(document).on('keydown', '.c_top_dv_inp_object', function(event) {
    let charCode = (event.which) ? event.which : event.keyCode;
    if (charCode == 13) {
        let sobject = $(this).val().trim();
        console.log('sobject-: ', sobject);
        handlePostObjectChosen(sobject);
    }
});

function handlePostObjectChosen(sobject) {
    $('.thead_1_tr').html('');
    $('.tbody_1').html('');
    getFields(sobject);
}

async function getFields(objectAPIName) {
    showSpinner();
    let apiResponse = await getFieldsFromServer(objectAPIName);
    console.log('$apiResponse: ', apiResponse);
    if (apiResponse.isError) {
        $('.snackbar').text(apiResponse.message ? apiResponse.message : 'Invalid Object Name!');
        showToast();
    } else {
        fieldsMap = new Map();
        let data = checkResponse(apiResponse);
        console.log('$data: ', data);
        if (data) {
            fieldsAll = [...data.fields];
            console.log('$fieldsAll: ', fieldsAll);

            fieldsAll.forEach(val => {
                fieldsMap.set(val.name, val);
            });

            console.log('$fieldsMap: ', fieldsMap);

            generateFieldsList('');

            $('.c_top_dv_query').removeAttr('disabled');
            $('.c_top_dv_btn_object').removeAttr('disabled');
            $('.search_field').removeAttr('disabled');
            $('.search_field').val('')
            $('.c_top_dv_query').val(`SELECT Id From ${objectAPIName}`);
            selectedObject = objectAPIName;
            $('.c_top_dv_select_object').val(selectedObject);
            selectedFieldsArray = ['Id'];
            $('.td_Id').css('color', '#3938e4');
        }
    }
    hideSpinner();
}

$(document).on('input', '.c_top_dv_query', function(e) {
    let val = $(this).val().trim();
    if (!val) {
        selectedFieldsArray = [];
        $('.cb_left_table_td').css('color', 'black');
        $('.search_field').val('');
        generateFieldsList('');
    }
});

$(document).on('input', '.search_field', function(e) {
    let filterValue = $(this).val().trim();
    console.log('filterValue: ', filterValue);
    generateFieldsList(filterValue);
    selectedFieldsArray.forEach(f => {
        $(`.td_${f}`).css('color', '#3938e4');
    });
});

function generateFieldsList(filterValue) {
    let rows = '';
    fieldsAll.forEach(f => {
        if (filterValue) {
            if (f.name.toLowerCase().includes(filterValue.toLowerCase())) {
                rows += `<tr class="tr cb_left_table_tr">
                    <td class="cb_left_table_td td_${f.name}">${f.name}</td>
                </tr>`;
            }
        } else {
            rows += `<tr class="tr cb_left_table_tr">
                <td class="cb_left_table_td td_${f.name}">${f.name}</td>
            </tr>`;
        }
    });
    $('.cb_left_table').html(rows);
}

$(document).on('click', '.cb_left_table_td', function(e) {
    let field = $(this).text().trim();
    console.log('$field: ', field);
    if (!selectedFieldsArray.includes(field)) {
        if (field == 'Id') {
            selectedFieldsArray.unshift(field);
        } else {
            selectedFieldsArray.push(field);
        }
        $(this).css('color', '#3938e4');
    } else {
        const index = selectedFieldsArray.indexOf(field);
        if (index !== -1) {
            selectedFieldsArray.splice(index, 1);
        }
        $(this).css('color', 'black');
    }
    console.log('$selectedFieldsArray: ', selectedFieldsArray);
    makeQuery();
});

function makeQuery() {
    $('.c_top_dv_query').val(`SELECT ${selectedFieldsArray.join(', ')} From ${selectedObject} ${savedFilter}`.trim());
}
let savedFilter = '';
$(document).on('click', '.c_top_dv_btn_object', function(e) {
    recordsSaveMap = new Map();
    console.log('$selectedObject: ', selectedObject);
    let query = $('.c_top_dv_query').val();
    console.log('$query: ', query);

    query = query.replaceAll(' where ',' Where ').replaceAll(' limit ',' Limit ').replaceAll(' offset ',' Offset ');
    query = query.replace(new RegExp(`from ${selectedObject} `, 'gi'), `from ${selectedObject}::`);

    let filter = query?.split('::')?.at(1)?.trim();
    console.log('$filter: ',filter);
    
    let q = query;
    console.log('q1: - ', q);
    q = q.toLocaleLowerCase();
    console.log('q2: - ', q);

    q = q.substring(q.indexOf('select ') + 7, q.indexOf(' from'));
    console.log('q3: - ', q);
    q = q.split(/\s*,\s*/);
    console.log('q4: - ', q);

    selectedFieldsArray = [];

    q.forEach(f => {
        let field = fieldsAll.find(field => {
            return field.name.toLowerCase() == f;
        });
        if(field){
            selectedFieldsArray.push(field.name);
        }
    });

    query = `Select ${selectedFieldsArray.join(', ')} From ${selectedObject}`;

    query = filter ? query + ' ' + filter : query;
    savedFilter = filter ? filter : '';
    $('.c_top_dv_query').val(query);

    console.log('$query: ',query);
    console.log('$selectedFieldsArray: ',selectedFieldsArray);

    getRecords(query, selectedFieldsArray);
});

async function getRecords(query, fieldsArray) {
    showSpinner();
    let apiResponse = await getRecordsFromServer(query);
    console.log('$apiResponse: ', apiResponse);
    if (apiResponse.isError) {
        $('.snackbar').text(apiResponse.message ? apiResponse.message : 'Error Fetching Data...');
        showToast();
    } else {
        let data = checkResponse(apiResponse);
        if (data) {
            prepareRecordsARRAY(data, fieldsArray);
            console.log('$recordsAll: ', recordsAll);
            generateTableHeaders(fieldsArray);
            generateTable(fieldsArray);
            $('.btn_update').removeAttr('disabled');
        }
        hideSpinner();
    }
    hideSpinner();
    fieldsArray.forEach(f => {
        $(`.td_${f}`).css('color', '#3938e4');
    });
}

function generateTableHeaders(fieldsArray) {
    let thTags = '';
    fieldsArray.forEach((val, index) => {
        thTags += `<th class="th_1 th_1_${index}">
            ${fieldsMap.get(val).label}
        </th>`
    });
    $('.thead_1_tr').html(thTags);
}

$(document).on('click', '.td_ID', function(e) {
    $('.dropdown_contents_fields').addClass('hide');
    $('.dropdown_contents_sobjects').addClass('hide');
    copyToCLipboard($(this).text().trim(), true);
    $('.td_ID').css('color', 'rgb(42, 40, 40)');
    $(this).css('color', 'red');
});

$(document).on('contextmenu', '.td_ID', function(e) {
    let text = $(this).text().trim();
    if (idCheck(text)) {
        e.preventDefault();
        $('.td_ID').css('color', 'rgb(42, 40, 40)');
        $(this).css('color', 'red');
        openRecordDetail(text);
    }
});

function openRecordDetail(recordID) {
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    const valid = userKeyRegExp.test(recordID);
    if (valid) {
        recordID = 'recordID=' + recordID + '&';
        openMaximized('record.html?' + recordID + 'baseUrl=' + baseUrl + '&sessionId=' + sessionId);
    }
}


function generateTable(fieldsArray) {
    let trTags = '';
    recordsAll.forEach(rec => {
        let tdTags = '';
        fieldsArray.forEach(field => {
            if (field == 'CreatedDate') {
                let date_time = Intl.DateTimeFormat('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }).format(new Date(rec[field]));
                date_time = date_time.substring(0, date_time.length - 2) + date_time.substring(date_time.length - 2).toUpperCase();
                rec[field] = date_time;
            }
            let dataId = '';
            let idClass = '';
            if (field == 'Id') {
                idClass = 'td_ID';
                dataId = `td_ID data-id=${rec.Id}`;
            }

            if (fieldsMap.get(field).type == 'boolean' && fieldsMap.get(field).updateable) {
                let checkbox = rec[field] == 'true' ? 'checked' : '';
                tdTags += `<td class="td_value ${idClass}" ${dataId} data-name="${field}">
                    <input class="td_inp inp-boolean" type="checkbox" ${checkbox} data-recordid="${rec.Id}" data-name="${field}" data-type="${fieldsMap.get(field).type}"/>
                </td>`
            } else if ((fieldsMap.get(field).type == 'string' || fieldsMap.get(field).type == 'reference' || fieldsMap.get(field).type == 'phone' || fieldsMap.get(field).type == 'url' || fieldsMap.get(field).type == 'email') && fieldsMap.get(field).updateable) {
                tdTags += `<td class="td_value ${idClass}" ${dataId} data-name="${field}">
                    <input class="td_inp inp-string" value="${rec[field]}" data-recordid="${rec.Id}" data-name="${field}" data-type="${fieldsMap.get(field).type}"/>
                </td>`
            } else if ((fieldsMap.get(field).type == 'double' || fieldsMap.get(field).type == 'percent' || fieldsMap.get(field).type == 'currency' || fieldsMap.get(field).type == 'number') && fieldsMap.get(field).updateable) {
                tdTags += `<td class="td_value ${idClass}" ${dataId} data-name="${field}">
                    <input class="td_inp inp-number" value="${rec[field]}" type="number" data-recordid="${rec.Id}" data-name="${field}" data-type="${fieldsMap.get(field).type}"/>
                </td>`
            } else if (fieldsMap.get(field).type == 'date' && fieldsMap.get(field).updateable) {
                tdTags += `<td class="td_value ${idClass}" ${dataId} data-name="${field}">
                    <input class="td_inp inp-date" value="${rec[field]}" type="date" data-recordid="${rec.Id}" data-name="${field}" data-type="${fieldsMap.get(field).type}"/>
                </td>`
            } else if (fieldsMap.get(field).type == 'datetime' && fieldsMap.get(field).updateable) {
                let dtArray = rec[field]?.split('T');
                let datevalue = dtArray?.at(0);
                let timevalue = dtArray?.at(1);
                timevalue = timevalue?.substring(0, timevalue?.lastIndexOf(':'));

                tdTags += `<td class="td_value ${idClass}" ${dataId} data-name="${field}">
                    <div class="datetime_flex">
                        <div class="datetime_left">
                            <input class="td_inp inp-datetime_date" value="${datevalue}" type="date" data-recordid="${rec.Id}" data-name="${field}" data-type="${fieldsMap.get(field).type}"/>
                        </div>
                        <div class="datetime_right">
                            <input class="td_inp inp-datetime_time" value="${timevalue}" type="time" data-recordid="${rec.Id}" data-name="${field}" data-type="${fieldsMap.get(field).type}"/>
                        </div>
                    </div>
                </td>`
            } else if (fieldsMap.get(field).type == 'textarea' && fieldsMap.get(field).updateable) {
                tdTags += `<td class="td_value ${idClass}" ${dataId} data-name="${field}">
                    <textarea class="td_inp inp-textarea" data-recordid="${rec.Id}" data-name="${field}" data-type="${fieldsMap.get(field).type}">${rec[field]}</textarea>
                </td>`
            } else if (fieldsMap.get(field).type == 'picklist' && fieldsMap.get(field).updateable) {
                let picklistValues = fieldsMap.get(field).picklistValues;
                let options = `<option value="--None--" selected>--None--</option>`;
                picklistValues.forEach(p => {
                    let selected = rec[field] == p.value ? 'selected' : '';
                    if (p.active) {
                        options += `<option value="${p.value}" ${selected}>${p.value}</option>`;
                    }
                });
                tdTags += `<td class="td_value ${idClass}" ${dataId} data-name="${field}">
                    <select class="td_inp inp-picklist" data-recordid="${rec.Id}" data-name="${field}" data-type="${fieldsMap.get(field).type}">
                        ${options}
                    </select>
                </td>`
            } else {
                tdTags += `<td class="td_value ${idClass}" ${dataId} data-name="${field}">
                    ${rec[field]}
                </td>`
            }

        });

        trTags += `<tr class="tbody_1_tr tbody_1_tr_1 tr_${rec.Id}">${tdTags}</tr>`;
    });
    document.title = `${selectedObject} Records - [ ${recordsAll.length} ]`;
    $('.tbody_1').html(trTags);
}

$(document).on('change', '.inp-boolean', function(e) {
    let type = $(this).attr('data-type');
    console.log('$type: ', type);
    let name = $(this).attr('data-name');
    console.log('$name: ', name);
    let checked = $(this).prop('checked');
    console.log('$checked: ', checked);
    let recordid = $(this).attr('data-recordid');
    console.log('$recordid: ', recordid);

    if (recordsSaveMap.has(recordid)) {
        let rec = recordsSaveMap.get(recordid);
        rec[name] = checked;
        recordsSaveMap.set(recordid, rec);
    } else {
        let rec = {};
        rec[name] = checked;
        recordsSaveMap.set(recordid, rec);
    }
    console.log('$recordsSaveMap: ', recordsSaveMap);
});
$(document).on('input', '.inp-string', function(e) {
    let type = $(this).attr('data-type');
    console.log('$type: ', type);
    let name = $(this).attr('data-name');
    console.log('$name: ', name);
    let value = $(this).val();
    console.log('$value: ', value);
    let recordid = $(this).attr('data-recordid');
    console.log('$recordid: ', recordid);

    if (recordsSaveMap.has(recordid)) {
        let rec = recordsSaveMap.get(recordid);
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    } else {
        let rec = {};
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    }
    console.log('$recordsSaveMap: ', recordsSaveMap);
});
$(document).on('input', '.inp-number', function(e) {
    let type = $(this).attr('data-type');
    console.log('$type: ', type);
    let name = $(this).attr('data-name');
    console.log('$name: ', name);
    let value = parseFloat($(this).val());
    console.log('$value: ', value);
    let recordid = $(this).attr('data-recordid');
    console.log('$recordid: ', recordid);

    if (recordsSaveMap.has(recordid)) {
        let rec = recordsSaveMap.get(recordid);
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    } else {
        let rec = {};
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    }
    console.log('$recordsSaveMap: ', recordsSaveMap);
});
$(document).on('input', '.inp-date', function(e) {
    let type = $(this).attr('data-type');
    console.log('$type: ', type);
    let name = $(this).attr('data-name');
    console.log('$name: ', name);
    let value = $(this).val();
    console.log('$value: ', value);
    let recordid = $(this).attr('data-recordid');
    console.log('$recordid: ', recordid);

    if (recordsSaveMap.has(recordid)) {
        let rec = recordsSaveMap.get(recordid);
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    } else {
        let rec = {};
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    }
    console.log('$recordsSaveMap: ', recordsSaveMap);
});
$(document).on('input', '.inp-datetime_date', function(e) {
    let type = $(this).attr('data-type');
    console.log('$type: ', type);
    let name = $(this).attr('data-name');
    console.log('$name: ', name);
    let value = $(this).val();
    console.log('$value: ', value);
    let recordid = $(this).attr('data-recordid');
    console.log('$recordid: ', recordid);

    if (recordsSaveMap.has(recordid)) {
        let rec = recordsSaveMap.get(recordid);
        if (rec[name]) {
            rec[name]['date'] = value;
        } else {
            rec[name] = {
                date: value
            };
        }
        recordsSaveMap.set(recordid, rec);
    } else {
        let rec = {};
        rec[name] = {
            date: value
        };
        recordsSaveMap.set(recordid, rec);
    }
    console.log('$recordsSaveMap: ', recordsSaveMap);
});
$(document).on('input', '.inp-datetime_time', function(e) {
    let type = $(this).attr('data-type');
    console.log('$type: ', type);
    let name = $(this).attr('data-name');
    console.log('$name: ', name);
    let value = $(this).val();
    console.log('$value: ', value);
    let recordid = $(this).attr('data-recordid');
    console.log('$recordid: ', recordid);

    if (recordsSaveMap.has(recordid)) {
        let rec = recordsSaveMap.get(recordid);
        if (rec[name]) {
            rec[name]['time'] = 'T' + value + ':00.000Z';
        } else {
            rec[name] = {
                time: 'T' + value + ':00.000Z'
            }
        }
        recordsSaveMap.set(recordid, rec);
    } else {
        let rec = {};
        rec[name] = {
            time: 'T' + value + ':00.000Z'
        }
        recordsSaveMap.set(recordid, rec);
    }
    console.log('$recordsSaveMap: ', recordsSaveMap);
});
$(document).on('input', '.inp-textarea', function(e) {
    let type = $(this).attr('data-type');
    console.log('$type: ', type);
    let name = $(this).attr('data-name');
    console.log('$name: ', name);
    let value = $(this).val();
    console.log('$value: ', value);
    let recordid = $(this).attr('data-recordid');
    console.log('$recordid: ', recordid);

    if (recordsSaveMap.has(recordid)) {
        let rec = recordsSaveMap.get(recordid);
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    } else {
        let rec = {};
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    }
    console.log('$recordsSaveMap: ', recordsSaveMap);
});
$(document).on('change', '.inp-picklist', function(e) {
    let type = $(this).attr('data-type');
    console.log('$type: ', type);
    let name = $(this).attr('data-name');
    console.log('$name: ', name);
    let value = $(this).val();
    console.log('$value: ', value);
    value = value == '--None--' ? '' : value;
    let recordid = $(this).attr('data-recordid');
    console.log('$recordid: ', recordid);

    if (recordsSaveMap.has(recordid)) {
        let rec = recordsSaveMap.get(recordid);
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    } else {
        let rec = {};
        rec[name] = value;
        recordsSaveMap.set(recordid, rec);
    }
    console.log('$recordsSaveMap: ', recordsSaveMap);
});

$(document).on('click', '.btn_update', function(e) {
    let requestBody = {
        allOrNone: true,
        records: []
    };
    for (let [key, val] of recordsSaveMap) {
        console.log('$key: ', key);
        console.log('$val: ', val);
        let recordBody = {
            attributes: {
                type: selectedObject
            },
            Id: key
        };
        let fieldValueMap = new Map(Object.entries(val));
        for (let [f, o] of fieldValueMap) {
            if (typeof o == 'object') {
                if (o.date) {
                    recordBody[f] = o.date + o.time;
                }
            } else {
                recordBody[f] = o;
            }
        }
        requestBody.records.push(recordBody);
    }
    console.log('$requestBody: ', requestBody);
    updateAllRecords(requestBody);
});

async function updateAllRecords(requestBody) {
    showSpinner();
    let apiResponse = await updateAllRecordsFromServer(requestBody);
    console.log('$apiResponse: ', apiResponse);
    let data = checkResponse(apiResponse);
    console.log('$data: ', data);
    if (apiResponse.isError) {
        $('.snackbar').text(apiResponse.message ? apiResponse.message : 'Something went wrong!');
    } else {
        if (data?.length) {
            let errorMessage = '';
            data.forEach(val => {
                if (val.errors && val?.errors?.length) {
                    let err = val?.errors[0];
                    if (err.statusCode != 'ALL_OR_NONE_OPERATION_ROLLED_BACK') {
                        errorMessage = err.message;
                    }
                }
            });
            $('.snackbar').text(errorMessage ? errorMessage : 'Records Updated!');
        }
    }
    showToast();
    hideSpinner();
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

async function updateAllRecordsFromServer(requestBody) {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);
    myHeaders.append("Content-Type", "application/json");

    var requestOptions = {
        method: 'PATCH',
        headers: myHeaders,
        body: JSON.stringify(requestBody),
        redirect: 'follow'
    };

    try {
        const response = await fetch(baseUrl + '/services/data/v59.0/composite/sobjects', requestOptions);
        console.log('$response: ', response);
        if (!response.ok) {
            return {
                isError: true,
                name: response.status,
                message: response.statusText,
                stack: response.type
            };
        }
        const result = await response.json();
        return {
            isError: false,
            data: result
        };
    } catch (error) {
        return {
            isError: true,
            name: error.name,
            message: error.message,
            stack: error.stack
        };
    }
}

async function getRecordsFromServer(query) {
    console.log('$query: ',query);
    if(fieldsMap.has('CreatedDate')){
        query = new RegExp(' limit | offset | order by ', 'gi').test(query) ? query : query + ' Order By CreatedDate DESC';
    }
    console.log('$query: ',query);
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
            return {
                isError: true,
                name: response.status,
                message: response.statusText,
                stack: response.type
            };
        }
        const result = await response.text();
        return {
            isError: false,
            data: result
        };
    } catch (error) {
        return {
            isError: true,
            name: error.name,
            message: error.message,
            stack: error.stack
        };
    }
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
            return {
                isError: true,
                name: response.status,
                message: response.statusText,
                stack: response.type
            };
        }
        const result = await response.json();
        return {
            isError: false,
            data: result
        };
    } catch (error) {
        return {
            isError: true,
            name: error.name,
            message: error.message,
            stack: error.stack
        };
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
            return {
                isError: true,
                name: response.status,
                message: response.statusText,
                stack: response.type
            };
        }
        const result = await response.json();
        return {
            isError: false,
            data: result
        };
    } catch (error) {
        return {
            isError: true,
            name: error.name,
            message: error.message,
            stack: error.stack
        };
    }
}


function showSpinner() {
    $(".spinner-div").show();
}

function hideSpinner() {
    $(".spinner-div").hide();
}

let timeout;

function showToast() {
    if (!timeout) {
        timeout = true;
        $('.snackbar').addClass('show');
        setTimeout(function() {
            $('.snackbar').removeClass('show');
            timeout = false;
        }, 2000);
    }
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

function copyToCLipboard(value, showTst) {
    let text = value;
    navigator.clipboard.writeText(text).then(function() {
        console.log('copied : ' + text);
        if (showTst) {
            $('.snackbar').text(text);
            showToast();
        }
    }, function(err) {
        console.error('error copying');
    });
}

function idCheck(recordID) {
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    return userKeyRegExp.test(recordID);
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

function showMessage(msg) {
    $('.snackbar').text(msg);
    showToast();
}

function showDiv(element) {
    $('.' + element).removeClass('hide');
}

function hideDiv(element) {
    $('.' + element).addClass('hide');
}