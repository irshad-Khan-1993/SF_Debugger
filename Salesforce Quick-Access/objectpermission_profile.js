let baseUrl = null;
let selectedObject;
let sessionId = null;
let profileDetailMap;
let objectNameLabelMap;
let profileNameObjectPermissionMap;
let doc_title = 'Object Permission - Profiles';
let conn;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    setSessionText();
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
    //Initialize Connection
    initialize();
});
async function initialize(){
    conn = await getConnection(baseUrl, sessionId);
    console.log('$conn: ',conn);
    fetchObjects();
    getAllProfiles();
}
async function getConnection(baseUrl, sessionId){
    let conn = new jsforce.Connection({
       instanceUrl : baseUrl,
       serverUrl : baseUrl,
       sessionId : sessionId
   });
   return conn;
 }
function fetchObjects() {
    showSpinner();
    conn.describeGlobal().then((result) => {
        objectNameLabelMap = new Map();
        console.log('$describeGlobal-result: ',result);
        let objects = result.sobjects;
        console.log('$objects: ', objects);
        objects.forEach(val => {
            objectNameLabelMap.set(val.name, val.label);
        });
        console.log('$objectNameLabelMap: ',objectNameLabelMap);
        generateObjDropdown();
    }).catch((err) => {
        console.error('$describeGlobal-err: ',err.message);
    });
}

async function getAllProfiles(){
    showSpinner();
    let fields_array = [
        'Id', 'IsCustom', 'Label', 'Name', 'ProfileId','Profile.Name'
    ];
    let q = `SELECT ${fields_array.join(',')} FROM PermissionSet Where ProfileId != Null Order By Profile.Name`;
    conn.query(q).then(async res => {
        console.log('$res: ',res);
        if(res.records){
            profileDetailMap = new Map();
            const promises = res.records.map(async (value) => {
                let profilesDetail = await conn.tooling.sobject('Profile').find({ Id: value.ProfileId }).execute();
                console.log('$profilesDetail: ',profilesDetail);
                let profileDetail = profilesDetail[0];
                console.log('$profileDetail: ', profileDetail);
                profileDetailMap.set(value.Profile.Name, {
                    ProfileId: value.ProfileId,
                    PermissionSetId: value.Id,
                    IsCustom: profileDetail.Metadata.custom
                });
            });
            await Promise.all(promises);
            console.log('$profileDetailMap: ',profileDetailMap);
            hideSpinner();
        }
    }).catch( error => {
        console.error('$error: ',error);
    });
}

function showError(title, message){
    $('.outer').addClass('blur-2');
    $('.small_popup_2_input_box').text(message);
    $('.errcode').text(title);
    showDiv('small_popup_2');
}

$(document).on('change', '.objects_dropdown', function (e) {
    let select = $(this).val().trim();
    console.log('select: ', select);
    selectedObject = select;
    $('.obj_api_name').val(selectedObject);
    getPermissions();
});
$(document).on('keydown', '.obj_api_name', function (event){
   let charCode = (event.which) ? event.which : event.keyCode;
   if(charCode == 13) {
        let objName = $(this).val();
        if(objectNameLabelMap.has(objName)){
            selectedObject = objName;
            $('.' + selectedObject).prop('selected','true');
            getPermissions();
        }
   }
});
async function getPermissions(){
    showSpinner();
    let filter = [];
    profileDetailMap.forEach((value, key) => {
        filter.push(`'${key}'`);
    });
    filter = filter.join(',');
    console.log('$filter: ',filter);
    
    let fields_array = [
        'Id', 'ParentId', 'SobjectType', 'PermissionsCreate', 'PermissionsRead','PermissionsDelete',
        'PermissionsEdit','PermissionsViewAllRecords','PermissionsModifyAllRecords','Parent.Profile.Name','Parent.ProfileId'
    ];
    let q = `SELECT ${fields_array.join(',')} FROM ObjectPermissions Where Parent.Profile.Name IN (${filter}) And SobjectType='${selectedObject}'`;
    conn.query(q).then(async res => {
        console.log('$ObjectPermissions: ',res);
        profileNameObjectPermissionMap = new Map();
        [...res.records].forEach(rec => {
            profileNameObjectPermissionMap.set(rec.Parent.Profile.Name, rec);
        });
        console.log('$profileNameObjectPermissionMap: ',profileNameObjectPermissionMap);
        generateProfileList();
        hideSpinner();
    }).catch( error => {
        console.error('$error: ',error);
    });
}
let search = '';
$(document).on('input', '.inp_profile_filter', function (e){
   search = $(this).val().trim();
   if(search.length > 2){
        generateProfileList();
   }
   if(search.length == 1 && access_filter != 'All'){
        access_filter = 'All';
        $('.All').prop('selected','true');
        generateProfileList();
   }
});

$(document).on('keyup', '.inp_profile_filter', function (e){
    search = $(this).val().trim();
    let charCode = (e.which) ? e.which : e.keyCode;
    if(charCode == 8 && search.length < 3) {
        search = '';
        generateProfileList();
    }
});
let access_filter = 'All';
$(document).on('input', '.access_dropdown', function (e){
   access_filter = $(this).val().trim();
   console.log('access_filter: ',access_filter);
   $('.inp_profile_filter').val('');
   search = '';
   generateProfileList();
});
function generateProfileList(){
    console.log('generate');
    let rows = '';
    let labelPsFieldMap = new Map();
    labelPsFieldMap.set('Read','PermissionsRead');
    labelPsFieldMap.set('Create','PermissionsCreate');
    labelPsFieldMap.set('Edit','PermissionsEdit');
    labelPsFieldMap.set('Delete','PermissionsDelete');
    labelPsFieldMap.set('View All','PermissionsViewAllRecords');
    labelPsFieldMap.set('Modify All','PermissionsModifyAllRecords');
    let psNames = ['Read','Create','Edit','Delete','View All','Modify All'];
    profileDetailMap.forEach((value, key) => {
        if(search && key.toLowerCase().includes(search.toLowerCase())){
            let ps_subcontainer = '';
            psNames.forEach(psnm => {
                let checked = '';
                let recordId = '';
                if(profileNameObjectPermissionMap.has(key)){
                    let psRec = profileNameObjectPermissionMap.get(key);
                    checked = `${psRec[labelPsFieldMap.get(psnm)] ? 'checked' : ''}`;
                    recordId = `data-recid="${psRec.Id}"`;
                }
                let disabled = `${profileDetailMap.get(key).IsCustom ? '' : 'disabled'}`;
                let graylabelclass = `${profileDetailMap.get(key).IsCustom ? '' : 'gray'}`;
                ps_subcontainer += `
                    <div class="ps_subcontainer">
                        <div class="ps_sub_l">
                            <label class="ps_lbl ${graylabelclass}">${psnm}</label>
                        </div>
                        <div class="ps_sub_r">
                            <input type="checkbox" class="ps_chk" data-profile="${key}" data-field=${labelPsFieldMap.get(psnm)} ${checked} ${recordId} ${disabled}/>
                        </div>
                    </div>
                `;
            });
            rows += `<tr class="tr">
                <td class="td">${key}</td>
                <td class="td"><div class="ps_container">${ps_subcontainer}</div></td>
            </tr>`;
        }else if(!search){
            if(access_filter == 'All'){
                let ps_subcontainer = '';
                psNames.forEach(psnm => {
                    let checked = '';
                    let recordId = '';
                    if(profileNameObjectPermissionMap.has(key)){
                        let psRec = profileNameObjectPermissionMap.get(key);
                        checked = `${psRec[labelPsFieldMap.get(psnm)] ? 'checked' : ''}`;
                        recordId = `data-recid="${psRec.Id}"`;
                    }
                    let disabled = `${profileDetailMap.get(key).IsCustom ? '' : 'disabled'}`;
                    let graylabelclass = `${profileDetailMap.get(key).IsCustom ? '' : 'gray'}`;
                    ps_subcontainer += `
                        <div class="ps_subcontainer">
                            <div class="ps_sub_l">
                                <label class="ps_lbl ${graylabelclass}">${psnm}</label>
                            </div>
                            <div class="ps_sub_r">
                                <input type="checkbox" class="ps_chk" data-profile="${key}" data-field=${labelPsFieldMap.get(psnm)} ${checked} ${recordId} ${disabled}/>
                            </div>
                        </div>
                    `;
                });
                rows += `<tr class="tr">
                    <td class="td">${key}</td>
                    <td class="td"><div class="ps_container">${ps_subcontainer}</div></td>
                </tr>`;
            }else{
                if(profileNameObjectPermissionMap.has(key) && profileNameObjectPermissionMap.get(key)[access_filter]){
                    let ps_subcontainer = '';
                    psNames.forEach(psnm => {
                        let checked = '';
                        let recordId = '';
                        if(profileNameObjectPermissionMap.has(key)){
                            let psRec = profileNameObjectPermissionMap.get(key);
                            checked = `${psRec[labelPsFieldMap.get(psnm)] ? 'checked' : ''}`;
                            recordId = `data-recid="${psRec.Id}"`;
                        }
                        let disabled = `${profileDetailMap.get(key).IsCustom ? '' : 'disabled'}`;
                        let graylabelclass = `${profileDetailMap.get(key).IsCustom ? '' : 'gray'}`;
                        ps_subcontainer += `
                            <div class="ps_subcontainer">
                                <div class="ps_sub_l">
                                    <label class="ps_lbl ${graylabelclass}">${psnm}</label>
                                </div>
                                <div class="ps_sub_r">
                                    <input type="checkbox" class="ps_chk" data-profile="${key}" data-field=${labelPsFieldMap.get(psnm)} ${checked} ${recordId} ${disabled}/>
                                </div>
                            </div>
                        `;
                    });
                    rows += `<tr class="tr">
                        <td class="td">${key}</td>
                        <td class="td"><div class="ps_container">${ps_subcontainer}</div></td>
                    </tr>`;
                }
            }
            
        }
        
    });
    $('.tbody').html(rows);
    document.title = doc_title + ` [ ${$('.tr').length} ] `;
}
$(document).on('input', '.obj_api_name', function (e){
   let search = $(this).val().trim();
   console.log('search: ',search);
   generateObjDropdown(search);
});
function generateObjDropdown(search){
    let objoptions = '<option value="None">--None--</option>';
    objectNameLabelMap.forEach((value, key) => {
        if(!search){
            objoptions += `<option class="${key}" value="${key}">${key}</option>`;
        }else if(key.toLowerCase().includes(search.toLowerCase())){
            objoptions += `<option class="${key}" value="${key}">${key}</option>`;
        }
    });
    $('.objects_dropdown').html(objoptions);
    $('.obj_api_name').removeAttr('disabled');
}

$(document).on('change', '.ps_chk', function (e){
   let checked = $(this).prop('checked');
   console.log('$checked: ',checked);
   let profile = $(this).attr('data-profile');
   console.log('$profile: ',profile);
   let field = $(this).attr('data-field');
   console.log('$field: ',field);
   let recid = $(this).attr('data-recid');
   console.log('$recid: ',recid);
   console.log('$selectedObject: ',selectedObject);
   if(recid){
       $('.outer').addClass('blur-2');
        conn.sobject("ObjectPermissions").update({ Id: recid, [field] : checked }).then((result) => {
            console.log('$permissionUpdate_result: ',result);
            $('.outer').removeClass('blur-2');
            if(result.success){
                $('.snackbar').text('Updated.');
            }else{
                $('.snackbar').text('Something Went Wrong...!!!');
            }
            showToast();
        }).catch((err) => {
            console.log('$permissionUpdate_error-CODE: ',err.errorCode);
            console.log('$permissionUpdate_error-MESSAGE: ',err.message);
            $('.outer').removeClass('blur-2');
            showError(err.errorCode, err.message);
        });
   }else{
        $('.outer').addClass('blur-2');
        conn.sobject("ObjectPermissions").create({ [field] : checked, ParentId: profileDetailMap.get(profile).PermissionSetId, SObjectType: selectedObject }).then((result) => {
            console.log('$permissionCreate_result: ',result);
            $('.outer').removeClass('blur-2');
            if(result.success){
                $('.snackbar').text('Created.');
            }else{
                $('.snackbar').text('Something Went Wrong...!!!');
            }
            showToast();
            getPermissions();
        }).catch((err) => {
            console.log('$permissionCreate_error-CODE: ',err.errorCode);
            console.log('$permissionCreate_error-MESSAGE: ',err.message);
            $('.outer').removeClass('blur-2');
            showError(err.errorCode, err.message);
            getPermissions();
        });
   }
   
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
    doc_title = doc_title + ' - ' + a;
    document.title = doc_title;
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
/* ERROR POPUP STARTS */
$(document).on('click', '.close-icon-2', function (e) {
    hideDiv('small_popup_2');
    $('.outer').removeClass('blur-2');
    getPermissions();
});
function showDiv(element) {
    $('.' + element).removeClass('hide');
}
function hideDiv(element) {
    $('.' + element).addClass('hide');
}
/* ERROR POPUP ENDS */