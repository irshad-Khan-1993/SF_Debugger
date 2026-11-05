document.addEventListener('DOMContentLoaded', function() {
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, function(tabs) {
        var tab = tabs[0];
        if (tab && (tab.url.indexOf('force.com') != -1 || tab.url.indexOf('salesforce.com') != -1 || tab.url.indexOf('salesforce-setup.com') != -1 || tab.url.indexOf('site.com') != -1)) {
            showDiv('saleforce_div');
        } else {
            showDiv('warn_dv');
        }
    });
});

document.addEventListener('click', function(e) {
    var target = e.target;

    if (target.closest('.lst_vf_lwc_debug')) {
        initializeOnLoad('vfpage_and_lwc_debug.html');
    } else if (target.closest('.user')) {
        initializeOnLoad('record');
    } else if (target.closest('.lst_record')) {
        initializeOnLoad('record.html');
    } else if (target.closest('.lst_metadata')) {
        initializeOnLoad('metadata.html');
    } else if (target.closest('.lst_object')) {
        initializeOnLoad('objects.html');
    } else if (target.closest('.lst_debugs')) {
        initializeOnLoad('debuglogs.html');
    } else if (target.closest('.lst_records_list')) {
        initializeOnLoad('recordslist.html');
    } else if (target.closest('.lst_permissions')) {
        initializeOnLoad('permission.html');
    } else if (target.closest('.lst_users')) {
        initializeOnLoad('users.html');
    } else if (target.closest('.lst_bulkupdate')) {
        initializeOnLoad('bulkupdate.html');
    } else if (target.closest('.logs_list')) {
        initializeOnLoad('logslist.html');
    } else if (target.closest('.lst_asynjobs')) {
        initializeOnLoad('asyncjobs.html');
    } else if (target.closest('.lst_objectpermission_profiles')) {
        initializeOnLoad('objectpermission_profile.html');
    } else if (target.closest('.lst_objectpermission_permissionsets')) {
        initializeOnLoad('objectpermission_ps.html');
    } else if (target.closest('.fls_permissionsets')) {
        initializeOnLoad('fls_permissionsets.html');
    } else if (target.closest('.fls_profiles')) {
        initializeOnLoad('fls_profiles.html');
    } else if (target.closest('.downloadmetadata')) {
        initializeOnLoad('downloadmetadata.html');
    } else if (target.closest('.lst_more_info')) {
        window.open('https://youtu.be/Wm2TaOa8wYk', '_blank');
    }
});

let recordID = '';

function initializeOnLoad(page) {
    getSessionID();

    function getSessionID() {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, function(tabs) {
            var tab = tabs[0];
            if (tab && (tab.url.indexOf('force.com') != -1 || tab.url.indexOf('salesforce.com') != -1 || tab.url.indexOf('my.salesforce-setup') != -1 || tab.url.indexOf('site.com') != -1)) {
                chrome.cookies.getAll({
                    name: 'sid'
                }, function(cookies) {
                    let sid = cookies.find(element => {
                        return element.domain.includes(getUrlInSalesforceForm(tab.url));
                    });
                    let baseUrl = sid ? ('https://' + sid.domain.replace('lightning.force', 'my.salesforce').replace('my.salesforce-setup', 'my.salesforce')) : '';
                    let sessionId = sid ? sid.value : '';
                    if (page == 'record') {
                        openUserRecord(baseUrl, sessionId);
                    } else {
                        getRecordDetailId(tab.url);
                        openMaximized(page + '?' + recordID + 'baseUrl=' + baseUrl + '&sessionId=' + sessionId + '&targetTabId=' + tab.id + '&targetUrl=' + encodeURIComponent(tab.url));
                    }
                });
                if (chrome.action && chrome.action.enable) {
                    chrome.action.enable(tab.id);
                }
            } else {}
        });
    }
}

async function openUserRecord(baseUrl, sessionId) {
    let conn = await getConnection(baseUrl, sessionId);
    console.log('$conn: ', conn);
    const res = await conn.identity();
    console.log('$res: ', res);
    window.open(baseUrl + '/lightning/setup/ManageUsers/page?address=%2F' + res.user_id + '%3Fnoredirect%3D1');
}

async function getConnection(baseUrl, sessionId) {
    let conn = new jsforce.Connection({
        instanceUrl: baseUrl,
        serverUrl: baseUrl,
        sessionId: sessionId
    });
    return conn;
}

function getRecordDetailId(url) {
    var el = document.createElement('a');
    el.href = url;
    let info = el.pathname.split("/");
    if (info && info.length && info[info.length - 1].toLowerCase() == 'view' && info.length > 5) {
        let sObjectId = info[info.length - 2];
        recordID = 'recordID=' + sObjectId + '&';
    }
}

function getUrlInSalesforceForm(url) {
    url = url.replace('https://', '').split('/')[0].replace('lightning.force', 'my.salesforce').replace('my.salesforce-setup', 'my.salesforce');
    return url;
}

function openMaximized(url) {
    if (url) {
        chrome.windows.create({
            type: 'popup',
            url: url,
            state: 'maximized'
        });
        window.close();
    }
}

function showDiv(element) {
    var el = document.querySelector('.' + element);
    if (el) {
        el.classList.remove('hide');
    }
}

function hideDiv(element) {
    var el = document.querySelector('.' + element);
    if (el) {
        el.classList.add('hide');
    }
}
