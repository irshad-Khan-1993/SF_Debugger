let conn;
let baseUrl;
let logData;
let sessionId;
let recordsAll;
let totalCount = 0;
let recordsCurrent;
let completeLogSize = 0;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    //Initialize Connection
    initialize();
});

async function initialize() {
    //Connection
    conn = await getConnection(baseUrl, sessionId);
    console.log('$conn: ', conn);
    getCompleteLogSize(null);
    //Fetch Records
    fetchRecords();
}

async function getConnection(baseUrl, sessionId) {
    let conn = new jsforce.Connection({
        instanceUrl: baseUrl,
        serverUrl: baseUrl,
        sessionId: sessionId
    });
    return conn;
}

function fetchRecords() {
    let fields_array = [
        'Id', 'Location', 'DurationMilliseconds', 'Request', 'LastModifiedDate',
        'LogUser.Name', 'Application', 'Status', 'Operation', 'LogLength', 'LogUserId'
    ];
    let q = `SELECT ${fields_array.join(',')} FROM ApexLog Order By LastModifiedDate DESC`; //q += ' LIMIT 10';
    conn.query(q).then(res => {
        console.log('$res: ', res);
        totalCount = res.totalSize;
        console.log('$totalCount: ', totalCount);
        console.log('$FetchedCount: ', res.records.length);
        console.log('$Records: ', res.records);
        recordsAll = [...res.records];
        console.log('$recordsAll: ', recordsAll);
        recordsCurrent = [...res.records];
        console.log('$recordsCurrent: ', recordsCurrent);
        //Generate Table
        generateTable();
        generateUserOptions();
        hideSpinner();
    }).catch(error => {
        console.error('$error: ', error);
        hideSpinner();
    });
}

function getCompleteLogSize(title) {
    let q = 'SELECT SUM(LogLength) completeLogSize FROM ApexLog';
    conn.query(q).then(res => {
        console.log('$CompleteLogSize: ', res);
        if (res && res.records && res.records[0]) {
            completeLogSize = res.records[0].completeLogSize;
            console.log('$completeLogSize: ', completeLogSize);
            if (title) {
                title = title.replace('0 B', formatBytes(completeLogSize));
                document.title = title;
            }
        }
    }).catch(error => {
        console.error('$CompleteLogSize_error: ', error);
    });
}

function generateTable() {
    let trTags = '';
    let totalSize = 0;
    recordsCurrent.forEach(rec => {
        let tdTags = `<td class="td_1 record-id" title="${rec.Id}">${rec.Id}</td>`;
        tdTags += `<td class="td_1" title="${rec.LogLength}">${rec.LogLength}</td>`;
        tdTags += `<td class="td_1" title="${rec.Size}">${formatBytes(rec.LogLength)}</td>`;
        tdTags += `<td class="td_1" title="${getConvertedDateTime(rec.LastModifiedDate)}">${getConvertedDateTime(rec.LastModifiedDate)}</td>`;
        tdTags += `<td class="td_1" title="${rec.LogUser.Name}">${rec.LogUser.Name}</td>`;
        tdTags += `<td class="td_1" title="${rec.Status}">${rec.Status}</td>`;
        tdTags += `<td class="td_1" title="${rec.Operation}">${rec.Operation}</td>`;
        tdTags += `<td class="td_1" title="${rec.DurationMilliseconds}">${formatMilliseconds(rec.DurationMilliseconds)}</td>`;
        // tdTags += `<td class="td_1" title="${rec.Request}">${rec.Request}</td>`;
        // tdTags += `<td class="td_1" title="${rec.Location}">${rec.Location}</td>`;
        // tdTags += `<td class="td_1" title="${rec.Application}">${rec.Application}</td>`;
        tdTags += `<td class="td_1"><i class="open-icon fa fa-arrow-circle-o-up fa-2x" aria-hidden="true" data-recId="${rec.Id}"></i></td>`;
        totalSize += rec.LogLength;
        trTags += `<tr class="tr_${rec.Id}">${tdTags}</tr>`;
    });
    // document.title = `Logs - [ ${totalCount} ] : Showing - [ ${recordsCurrent.length} ] : Total Size:- ${formatBytes(totalSize)}`;
    if (completeLogSize == 0) {
        getCompleteLogSize(`Total Logs - [ ${totalCount} - ${formatBytes(completeLogSize)} ] : Showing - [ ${recordsCurrent.length} - ${formatBytes(totalSize)}]`);
    } else {
        document.title = `Total Logs - [ ${totalCount} - ${formatBytes(completeLogSize)} ] : Showing - [ ${recordsCurrent.length} - ${formatBytes(totalSize)}]`;
    }
    $('.tbody_1').html(trTags);
}

function generateUserOptions() {
    let usersSet = new Set();
    recordsAll.forEach(rec => {
        usersSet.add(rec.LogUser.Name);
    });
    let user_options = '<option value="All Users" selected>All Users</option>';
    usersSet.forEach(val => {
        user_options += `<option value="${val}">${val}</option>`;
    });
    $('.user_options').html(user_options);
}

$(document).on('change', '.user_options', function (e) {
    let val = $(this).val().trim();
    console.log('val: ', val);
    if (val == 'All Users') {
        recordsCurrent = [...recordsAll];
        generateTable();
    } else {
        recordsCurrent = recordsAll.filter(rec => {
            return rec.LogUser.Name == val;
        });
        generateTable();
    }
});

function formatMilliseconds(ms) {
    if (ms < 1000) {
        return ms + ' ms';
    } else if (ms < 60 * 1000) {
        return (ms / 1000).toFixed(1) + ' s';
    } else if (ms < 60 * 60 * 1000) {
        return (ms / (60 * 1000)).toFixed(1) + ' m';
    } else {
        return (ms / (60 * 60 * 1000)).toFixed(1) + ' h';
    }
}

function getConvertedDateTime(dateTimeString) {
    let date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(dateTimeString));
    date_time = date_time.substring(0, date_time.length - 2) + date_time.substring(date_time.length - 2).toUpperCase();
    date_time = date_time.split(', ');
    date_time = date_time[1] + ', ' + date_time[0];
    return date_time;
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
}

$(document).on('click', '.td_1', function (e) {
    copyToCLipboard($(this).text().trim(), true);
});

function checkResponse(apiResponse) {
    if (apiResponse.isError) {
        hideSpinner();
        $$('.snackbar').text(apiResponse.message);
        showToast();
        return null;
    } else {
        return apiResponse.data;
    }
}

function showSpinner() {
    $(".spinner-div").show();
}

function hideSpinner() {
    $(".spinner-div").hide();
    $('.refresh_btn_icon').removeClass('fast-spin');
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

$(document).on('contextmenu', '.record-id', function (e) {
    let text = $(this).text().trim();
    e.preventDefault();
    openRecordDetail(text);
});


function openRecordDetail(recordID) {
    const userKeyRegExp = /[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}/;
    const valid = userKeyRegExp.test(recordID);
    if (valid) {
        recordID = 'recordID=' + recordID + '&';
        openMaximized('record.html?' + recordID + 'baseUrl=' + baseUrl + '&sessionId=' + sessionId);
    }
}

function copyToCLipboard(value, showTst) {
    if (value) {
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

$(document).on('click', '.delete_btn', async function (e) {
    console.log('$recordsCurrent: ', recordsCurrent);
    let delete_input = $('.delete_input').val();
    console.log('$delete_input: ', delete_input);
    if (delete_input && delete_input > 0 && delete_input <= recordsCurrent.length) {
        let logsIdsToDelete = [];
        for (let i = 0; i < delete_input; i++) {
            logsIdsToDelete.push(recordsCurrent[i].Id);
        }
        console.log('$logsIdsToDelete: ', logsIdsToDelete);
        if (logsIdsToDelete.length > 0) {
            let index = 0;
            const promises = logsIdsToDelete.map(async (logId) => {
                let apiResponse = await deleteLogsFromServer(logId);
                console.log('$apiResponse: ', apiResponse);
                if (apiResponse.message == 'Unexpected end of JSON input') {
                    console.log('Deleted: ' + logId);
                    $('.tr_' + logId).css('background', '#fdc8c8');
                    index++;
                    $('.delete_btn').text('Deleted [ ' + index + ' ]');
                }
            });
            await Promise.all(promises);
            $('.delete_btn').text('Delete');
        }
    } else {
        console.log('Checkpoint 2');
    }
});

async function deleteLogsFromServer(logId) {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'DELETE',
        headers: myHeaders,
        redirect: 'follow'
    };

    try {
        const response = await fetch(baseUrl + '/services/data/v60.0/sobjects/Apexlog/' + logId, requestOptions);
        if (!response.ok) {
            return { isError: true, name: response.status, message: response.statusText, stack: response.type };
        }
        const result = await response.json();
        return { isError: false, data: result };
    } catch (error) {
        return { isError: true, name: error.name, message: error.message, stack: error.stack };
    }
}
$(document).on('change', '.log_filter', function (e) {
    let val = $(this).val().trim();
    console.log('val: ', val);
    if (val == 'Large First') {
        recordsCurrent = recordsCurrent.sort(function (a, b) { return b.LogLength - a.LogLength });
        console.log('$recordsCurrent: ', recordsCurrent);
        generateTable();
    } else if (val == 'Small First') {
        recordsCurrent = recordsCurrent.sort(function (a, b) { return a.LogLength - b.LogLength });
        console.log('$recordsCurrent: ', recordsCurrent);
        generateTable();
    } else if (val == 'New First') {
        recordsCurrent.sort((a, b) => {
            const dateA = new Date(a.LastModifiedDate);
            const dateB = new Date(b.LastModifiedDate);
            // return dateA - dateB; // Old First
            return dateB - dateA; //New First
        });
        console.log('$recordsCurrent: ', recordsCurrent);
        generateTable();
    } else if (val == 'Old First') {
        recordsCurrent.sort((a, b) => {
            const dateA = new Date(a.LastModifiedDate);
            const dateB = new Date(b.LastModifiedDate);
            return dateA - dateB;
        });
        console.log('$recordsCurrent: ', recordsCurrent);
        generateTable();
    } else if (val == 'Failed Logs') {
        recordsCurrent = recordsCurrent.filter(rec => {
            return rec.Status != 'Success';
        });
        generateTable();
    } else if (val == 'Passed Logs') {
        recordsCurrent = recordsCurrent.filter(rec => {
            return rec.Status == 'Success';
        });
        generateTable();
    } else if (val == 'Long Running First') {
        recordsCurrent = recordsCurrent.sort(function (a, b) { return b.DurationMilliseconds - a.DurationMilliseconds });
        console.log('$recordsCurrent: ', recordsCurrent);
        generateTable();
    } else if (val == 'Long Running Last') {
        recordsCurrent = recordsCurrent.sort(function (a, b) { return a.DurationMilliseconds - b.DurationMilliseconds });
        console.log('$recordsCurrent: ', recordsCurrent);
        generateTable();
    }
});
$(document).on('click', '.close_btn_dv', function (e) {
    $('.d_outer').removeClass('blur');
    $('.small_popup_2').addClass('hide');
});

$(document).on('click', '.open-icon', function (e) {
    let recordID = $(this).attr('data-recId');
    console.log('$recordID: ', recordID);
    let rec = recordsCurrent.find(element => {
        return element.Id == recordID;
    });
    console.log('$rec: ', rec);
    getLogData(recordID, rec);
});

function getLogData(logId, rec) {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };
    showSpinner();
    fetch(baseUrl + '/services/data/v60.0/tooling/sobjects/ApexLog/' + logId + '/Body', requestOptions).then(response => response.text()).then(result => {
        console.log('$API: ', result);
        $('.d_outer').addClass('blur');
        $('.small_popup_2').removeClass('hide');
        logData = result;
        $('.txt_log_body').val(logData);
        $('.errcode').text('LOG - ' + formatBytes(rec.LogLength) + ' - [ ' + getConvertedDateTime(rec.LastModifiedDate) + ' ]');
        hideSpinner();
        showUserDebugOnly = false;
        $('.debug_only').css('background', '#ffffff');
    }).catch(error => {
        console.log('$API: error', error);
        hideSpinner();
    });
}
let showUserDebugOnly = false;
$(document).on('click', '.debug_only', function (e) {
    showUserDebugOnly = !showUserDebugOnly;
    if (showUserDebugOnly) {
        let data = logData.split('\n').filter(line => {
            return line.includes('USER_DEBUG|[') == true;
        });
        try {
            data = data.map((line, indx) => {
                line = (indx + 1) + '. ' + line.substring(line.indexOf(']|DEBUG|') + 8);
                return line;
            });
        } catch (error) {
            console.error('$error: ', error);
        }
        $('.txt_log_body').val(data.join('\n\n'));
        $('.debug_only').css('background', '#e1ffde');
    } else {
        $('.txt_log_body').val(logData);
        $('.debug_only').css('background', '#ffffff');
    }
});
$(document).on('click', '.refresh_btn', function (e) {
    window.location.reload();
});