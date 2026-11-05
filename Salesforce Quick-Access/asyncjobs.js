let conn;
let baseUrl;
let logData;
let sessionId;
let recordsAll;
let whereClause;
let totalCount = 0;
let recordsCurrent;
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

async function initialize(){
    //Connection
    conn = await getConnection(baseUrl, sessionId);
    console.log('$conn: ',conn);
    //Fetch Records
    whereClause = 'Where CreatedDate = LAST_N_DAYS:30';
    fetchRecords();
    getTotalJobsCount();
    // fetchRecords('');
}

function getTotalJobsCount(title){
    let q = 'SELECT COUNT() FROM AsyncApexJob';
    conn.query(q).then(res => {
        console.log('$total_jobs-: ',res);
        $('.total_jobs').text('Total Jobs [ '+res.totalSize+' ]');
    }).catch( error => {
        console.error('$total_jobs_error: ',error);
    });
}

async function getConnection(baseUrl, sessionId){
    let conn = new jsforce.Connection({
       instanceUrl : baseUrl,
       serverUrl : baseUrl,
       sessionId : sessionId
   });
   return conn;
 }
 $(document).on('change', '.job_filter', function (e){
    let val = $(this).val().trim();
    console.log('val: ',val);
    showSpinner();
    if(val == '1 Hour'){
        let date = new Date();
        date.setMinutes(date.getMinutes() - 60);
        let isoDate = date.toISOString();
        console.log('$isoDate: ',isoDate);
        whereClause = `Where CreatedDate >= ${isoDate}`;
        fetchRecords();
    }else if(val == 'Today'){
        whereClause = 'Where CreatedDate = Today';
        fetchRecords();
    }else if(val == 'Yesterday'){
        whereClause = 'Where CreatedDate = Yesterday';
        fetchRecords();
    }else if(val == 'This Week'){
        whereClause = 'Where CreatedDate = THIS_WEEK';
        fetchRecords();
    }else if(val == 'This Month'){
        whereClause = 'Where CreatedDate = THIS_MONTH';
        fetchRecords();
    }else if(val == 'Last 30 Days'){
        whereClause = 'Where CreatedDate = LAST_N_DAYS:30';
        fetchRecords();
    }else if(val == '24 Hours'){
        let date = new Date();
        date.setHours(date.getHours() - 24);
        let isoDate = date.toISOString();
        console.log('$isoDate: ',isoDate);
        whereClause = `Where CreatedDate >= ${isoDate}`;
        fetchRecords();
    }
 });
 $(document).on('click', '.refresh_btn', function (e){
    // window.location.reload();
    $('.refresh_btn_icon').addClass('fast-spin');
    showSpinner();
    fetchRecords();
 });
function fetchRecords() {
    let fields_array = [
        'Id', 'CreatedDate', 'CreatedBy.Name', 'JobType', 'ApexClass.Name', 'Status', 'JobItemsProcessed', 'TotalJobItems', 
        'NumberOfErrors', 'CompletedDate', 'MethodName'
    ];

    let q = `SELECT ${fields_array.join(',')} FROM AsyncApexJob ${whereClause} Order By CreatedDate DESC`; //q += ' LIMIT 50';
    console.log('$q: ',q);
    conn.query(q).then(res => {
        console.log('$res: ',res);
        totalCount = res.totalSize;
        console.log('$totalCount: ',totalCount);
        console.log('$FetchedCount: ', res.records.length);
        console.log('$Records: ', res.records);
        recordsAll = [...res.records];
        console.log('$recordsAll: ',recordsAll);
        recordsCurrent = [...res.records];
        console.log('$recordsCurrent: ',recordsCurrent);
        generateTable();
        generateJobOptions();
        hideSpinner();
    }).catch( error => {
        console.error('$error: ',error);
        hideSpinner();
    });
}

function generateTable() {
    let trTags = '';
    recordsCurrent.forEach(rec => {

        let currentAndTotalJobItems = rec.Status == 'Completed' 
                                      && rec.TotalJobItems == 0 ? '' : `${rec.JobItemsProcessed} / ${rec.TotalJobItems}`;

        let tdTags = `<td class="td_1 record-id" title="${rec.Id}">${rec.Id}</td>`;
        tdTags += `<td class="td_1" title="${rec.JobType}">${rec.JobType}</td>`;
        tdTags += `<td class="td_1" title="${getConvertedDateTime(rec.CreatedDate)}">${getConvertedDateTime(rec.CreatedDate)}</td>`;
        tdTags += `<td class="td_1" title="${rec?.CreatedBy?.Name}">${rec?.CreatedBy?.Name}</td>`;
        tdTags += `<td class="td_1" title="${rec?.ApexClass?.Name ? rec?.ApexClass?.Name : ''}">${rec?.ApexClass?.Name ? rec?.ApexClass?.Name : ''}</td>`;
        tdTags += `<td class="td_1" title="${rec.MethodName ? rec.MethodName : ''}">${rec.MethodName ? rec.MethodName : ''}</td>`;
        tdTags += `<td class="td_1" title="${rec.Status}">${rec.Status}</td>`;
        tdTags += `<td class="td_1" title="${currentAndTotalJobItems}">${currentAndTotalJobItems}</td>`;
        tdTags += `<td class="td_1" title="${rec.CompletedDate ? getConvertedDateTime(rec.CompletedDate) : ''}">${rec.CompletedDate ? getConvertedDateTime(rec.CompletedDate) : ''}</td>`;
        // tdTags += `<td class="td_1"><i class="refresh_job fa fa-arrow-circle-o-up fa-2x" aria-hidden="true" data-recId="${rec.Id}"></i></td>`;
        // tdTags += `<td class="td_1"><i class="refresh_job fa fa-refresh" aria-hidden="true"></i></td>`;
        tdTags += `<td class="td_1">${rec.Status == 'Processing' ? `<i class="refresh_job fa fa-refresh" aria-hidden="true" data-recId="${rec.Id}"></i>` : ''}</td>`;
        
        let status_class = '';
        if(rec.Status == 'Processing'){
            status_class = 'processing_job';
        }else if(rec.Status == 'Failed'){
            status_class = 'failed_job';
        }else{
            status_class = 'completed_job';
        }
        
        trTags += `<tr class="tr_${rec.Id} ${status_class}">${tdTags}</tr>`; //Processing
    });
    // document.title = `Showing - [ ${recordsCurrent.length} ] Async Apex Jobs`;
    $('.showing_jobs').text(`Showing [ ${recordsCurrent.length} ]`);
    $('.tbody_1').html(trTags);
}
$(document).on('click', '.refresh_job', function (e){
    $(this).addClass('fast-spin');
    let recordID = $(this).attr('data-recId');
    console.log('$recordID: ',recordID);
    let q = `SELECT Id, Status, JobItemsProcessed, TotalJobItems FROM AsyncApexJob Where Id = '${recordID}' LIMIT 1`;
    conn.query(q).then(res => {
        console.log('$res: ',res);
        let job = res?.records[0];
        let recIndex = recordsCurrent.findIndex(element => {
            return element.Id == recordID;
        });
        console.log('$recIndex: ',recIndex);

        recordsCurrent[recIndex].Status = job.Status;
        recordsCurrent[recIndex].TotalJobItems = job.TotalJobItems;
        recordsCurrent[recIndex].JobItemsProcessed = job.JobItemsProcessed;
        console.log('$recordsCurrent[recIndex]: ',recordsCurrent[recIndex]);
        // $(this).removeClass('fast-spin');
        generateTable();
    }).catch( error => {
        console.error('$error: ',error);
    });
});

/* async function getSingleRecord(icon, recId){
    let jobs = await conn.sobject('AsyncApexJob').retrieve([recId]);
    console.log('$jobs: ',jobs);
    icon.removeClass('fast-spin');
} */
function generateJobOptions(){
    let jobsSet = new Set();
    recordsAll.forEach(rec => {
        jobsSet.add(rec.JobType);
    });
    let job_options = '<option value="All Jobs" selected>All Jobs</option>';
    jobsSet.forEach(val => {
        job_options += `<option value="${val}">${val}</option>`;
    });
    $('.job_options').html(job_options);
}

$(document).on('change', '.job_options', function (e){
    let val = $(this).val().trim();
    console.log('val: ',val);
    if(val == 'All Jobs'){
        recordsCurrent = [...recordsAll];
        generateTable();
    }else{
        recordsCurrent = recordsAll.filter(rec => {
            return rec.JobType == val;
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

function getConvertedDateTime(dateTimeString){
    let date_time = Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).format(new Date(dateTimeString));
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