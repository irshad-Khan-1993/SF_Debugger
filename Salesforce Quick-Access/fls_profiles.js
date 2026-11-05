let psNamesList;
let objectsNameList;
let baseUrl = null;
let selectedObject;
let sessionId = null;
let psNameRecordMap;
let objectNameLabelMap;
let selectedPermissionset;
let fieldNameAndRecordMap;
let psNameAndPermissionObjMap;
let fieldNameAndPermissionRecodMap;
let doc_title = 'FLS - Profiles';
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
    setPsDropDownDivWidth();
    setObjDropDownDivWidth();
});
async function initialize(){
    conn = await getConnection(baseUrl, sessionId);
    console.log('$conn: ',conn);
    fetchObjects();
    getAllPermissionSets();
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
        objectsNameList = [];
        objectNameLabelMap = new Map();
        console.log('$describeGlobal-result: ',result);
        let objects = result.sobjects;
        console.log('$objects: ', objects);
        objects.forEach(val => {
            if(val.name.endsWith('ChangeEvent') || val.name.endsWith('Share') || val.name.endsWith('History'))
                return;
            objectNameLabelMap.set(val.name, val.label);
            objectsNameList.push(val.name);
        });
        console.log('$objectNameLabelMap: ',objectNameLabelMap);
        console.log('$objectsNameList: ',objectsNameList);
    }).catch((err) => {
        console.error('$describeGlobal-err: ',err.message);
    });
}
async function getAllPermissionSets(){
    showSpinner();
    let fields_array = [
        'Id', 'Label', 'Name', 'ProfileId','Profile.Name'
    ];
    let q = `SELECT ${fields_array.join(',')} FROM PermissionSet Where ProfileId != Null Order By Profile.Name`;
    conn.query(q).then(async res => {
        console.log('$res: ',res);
        if(res.records){
            psNamesList = [];
            psNameRecordMap = new Map();
            const promises = res.records.map(async (value) => {
                let profilesDetail = await conn.tooling.sobject('Profile').find({ Id: value.ProfileId }).execute();
                console.log('$profilesDetail: ',profilesDetail);
                let profileDetail = profilesDetail[0];
                console.log('$profileDetail: ', profileDetail);
                psNameRecordMap.set(value.Profile.Name, {
                    ProfileId: value.ProfileId,
                    PermissionSetId: value.Id,
                    IsCustom: profileDetail.Metadata.custom,
                    Label: value.Profile.Name
                });
                psNamesList.push(value.Profile.Name);
            });
            await Promise.all(promises);
            console.log('$psNameRecordMap: ',psNameRecordMap);
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

$(document).on('click', '.ps_name_td', function (e){
    let name = $(this).data('name');
    copyToCLipboard(fieldNameAndRecordMap.get(name)?.label, true);
});

$(document).on('change', '.ps_chk', function (e){
   let checked = $(this).prop('checked');
   console.log('$checked: ',checked);
   let field = $(this).attr('data-field');
   console.log('$field: ',field);
   let recid = $(this).attr('data-recid');
   console.log('$recid: ',recid);
   let fieldApiName = $(this).attr('data-fieldApiName');
   console.log('$fieldApiName: ',fieldApiName);
   console.log('$selectedObject: ',selectedObject);
   if(recid){
       $('.outer').addClass('blur-2');
       let refesh = false;
       let body = {};
       body.Id = recid;
       body[field] = checked;
        if(field == 'PermissionsRead' && checked == false){
            body.PermissionsEdit = false;
            refesh = true;
        }
        console.log('$body: ',body);
        conn.sobject("FieldPermissions").update(body).then((result) => {
            console.log('$permissionUpdate_result: ',result);
            $('.outer').removeClass('blur-2');
            if(result.success){
                $('.snackbar').text('updated');
            }else{
                $('.snackbar').text('Something Went Wrong...!!!');
            }
            if(refesh){
                getFieldPermissions();
            }else{
                // showToast();
            }
        }).catch((err) => {
            console.log('$permissionUpdate_error-CODE: ',err.errorCode);
            console.log('$permissionUpdate_error-MESSAGE: ',err.message);
            $('.outer').removeClass('blur-2');
            showError(err.errorCode, err.message);
        });
   }else{
        $('.outer').addClass('blur-2');
        let body = {};
        body.SObjectType = selectedObject;
        body.Field = `${selectedObject}.${fieldApiName}`;
        body.ParentId = psNameRecordMap.get(selectedPermissionset).PermissionSetId;
        body.PermissionsRead = field == 'PermissionsRead' ? checked : false;
        body.PermissionsEdit = field == 'PermissionsEdit' ? checked : false;
        if(body.PermissionsEdit){
            body.PermissionsRead = true;
        }
        console.log('$body: ',body);
        conn.sobject("FieldPermissions").create(body).then((result) => {
            console.log('$permissionCreate_result: ',result);
            $('.outer').removeClass('blur-2');
            if(result.success){
                $('.snackbar').text('Created.');
            }else{
                $('.snackbar').text('Something Went Wrong...!!!');
            }
            // showToast();
            getFieldPermissions();
        }).catch((err) => {
            console.log('$permissionCreate_error-CODE: ',err.errorCode);
            console.log('$permissionCreate_error-MESSAGE: ',err.message);
            $('.outer').removeClass('blur-2');
            showError(err.errorCode, err.message);
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
    getFieldPermissions();
});
function showDiv(element) {
    $('.' + element).removeClass('hide');
}
function hideDiv(element) {
    $('.' + element).addClass('hide');
}
/* ERROR POPUP ENDS */

/* Generate PS Dropdowns Starts */
$(document).on('input', '.dropdown_inp_ps', function (e){
    let searchTerm = $(this).val().trim();
    console.log('$searchTerm: ',searchTerm);
    if(psNamesList.includes(searchTerm)){
        $('.dropdown_contents_ps').addClass('hide');
        return;
    }
    generatePSDropdowns(searchTerm);
 });
 function generatePSDropdowns(searchTerm){
    let list = getFilteredPSList(searchTerm);
    let liTags = '';
    list.forEach(val => {
        liTags += `<li class="d_li d_li_ps">${val}</li>`;
    });
    $('.d_ul_ps').html(liTags);
    $('.dropdown_contents_ps').removeClass('hide');
}
$(document).on('focus', '.dropdown_inp_ps', function (e) {
    let searchTerm = $(this).val().trim();
    if(psNamesList.includes(searchTerm)){
        $('.dropdown_contents_ps').addClass('hide');
        return;
    }
    generatePSDropdowns(searchTerm);
});
$(document).on('blur', '.dropdown_inp_ps', function (e) {
    let searchTerm = $(this).val().trim();
    if(searchTerm){
        let list = getFilteredPSList(searchTerm);
        if(list.length == 1 && list[0] == searchTerm){
            console.log('Checkpoint callled');
            $('.dropdown_contents_ps').addClass('hide');
        }
    }
});
$(document).on('keydown', '.dropdown_inp_ps', function (event){
   let charCode = (event.which) ? event.which : event.keyCode;
   if(charCode == 13) {
        if($(this).val().length == 0){
            $('.dropdown_contents_ps').addClass('hide');
            $(this).blur();
        }
        if($(this).val().length > 0 && psNamesList.includes($(this).val())){
            selectedPermissionset = $(this).val();
            console.log('$selectedPermissionset: ',selectedPermissionset);
            console.log('$selectedObject: ',selectedObject);
            if(selectedObject && fieldNameAndRecordMap){
                showSpinner();
                getFieldPermissions();
            }
        }
   }
   if(charCode == 27) {
        $('.dropdown_contents_ps').addClass('hide');
        $(this).blur();
    }
});
function getFilteredPSList(searchTerm){
    let list = [];
    psNamesList.forEach(val => {
        if(searchTerm && !val.toLowerCase().includes(searchTerm.toLowerCase())){
            return;
        }else{
            list.push(val);
        }
    });
    return list;
}
$(document).on('click', '.d_li_ps', function (e) {
    let text = $(this).text().trim();
    console.log('$text: ', text);
    $('.dropdown_inp_ps').val(text);
    $('.dropdown_contents_ps').addClass('hide');
    selectedPermissionset = text;
    if(selectedObject && fieldNameAndRecordMap){
        showSpinner();
        getFieldPermissions();
    }
});
function setPsDropDownDivWidth() {
    var inputWidth = $('.dropdown_inp_ps').width();
    $('.dropdown_contents_ps').width(inputWidth + 8);
}
/* Generate PS Dropdowns Ends */

/* Generate OBJ Dropdowns Starts */
$(document).on('input', '.dropdown_inp_obj', function (e){
    let searchTerm = $(this).val().trim();
    console.log('$searchTerm: ',searchTerm);
    if(objectsNameList.includes(searchTerm)){
        $('.dropdown_contents_obj').addClass('hide');
        return;
    }
    generateOBJDropdowns(searchTerm);
 });
 function generateOBJDropdowns(searchTerm){
    let list = getFilteredOBJList(searchTerm);
    let liTags = '';
    list.forEach(val => {
        liTags += `<li class="d_li d_li_obj">${val}</li>`;
    });
    $('.d_ul_obj').html(liTags);
    $('.dropdown_contents_obj').removeClass('hide');
}
$(document).on('focus', '.dropdown_inp_obj', function (e) {
    let searchTerm = $(this).val().trim();
    if(objectsNameList.includes(searchTerm)){
        $('.dropdown_contents_obj').addClass('hide');
        return;
    }
    generateOBJDropdowns(searchTerm);
});
$(document).on('blur', '.dropdown_inp_obj', function (e) {
    let searchTerm = $(this).val().trim();
    if(searchTerm){
        let list = getFilteredOBJList(searchTerm);
        if(list.length == 1 && list[0] == searchTerm){
            $('.dropdown_contents_obj').addClass('hide');
        }
    }
});
$(document).on('keydown', '.dropdown_inp_obj', function (event){
   let charCode = (event.which) ? event.which : event.keyCode;
   if(charCode == 13) {
       $('.dropdown_contents_obj').addClass('hide');
       $(this).blur();
        if(objectsNameList.includes($(this).val())){
            selectedObject = $(this).val();
            if(selectedPermissionset){
                console.log('$selectedObject: ',selectedObject);
                console.log('$selectedPermissionset: ',selectedPermissionset);
                showSpinner();
                getObjectFields();
            }
        }
   }
   if(charCode == 27) {
        $('.dropdown_contents_obj').addClass('hide');
        $(this).blur();
    }
});

function getObjectFields(){
    /* conn.sobject(selectedObject).describe().then((result) => {
        console.log(`$describe-${selectedObject}: `, result);
        console.log(`$fields: `, result.fields);
        if(result.fields){
            fieldNameAndRecordMap = new Map();
            result.fields.forEach(val => {
                fieldNameAndRecordMap.set(val.name, val);
            });
            console.log('$fieldNameAndRecordMap: ',fieldNameAndRecordMap);
            getFieldPermissions();
        }
    }).catch((err) => {
        console.error('$err-msg: ',err.message);
        console.error('$err-code: ',err.errorCode);
    }); */
    conn.metadata.read('CustomObject', selectedObject).then((result) => {
        console.log(`$describe-${selectedObject}: `, result);
        console.log(`$fields: `, result.fields);
        if(result.fields){
            fieldNameAndRecordMap = new Map();
            result.fields.forEach(val => {
                fieldNameAndRecordMap.set(val.fullName, {
                    name: val.fullName,
                    label: val.label,
                    permissionable: true,
                    updateable: true
                });
            });
            console.log('$fieldNameAndRecordMap: ',fieldNameAndRecordMap);
            conn.sobject(selectedObject).describe().then((res) => {
                console.log(`$describe-${selectedObject}: `, res);
                console.log(`$fields: `, res.fields);
                if(res.fields){
                    res.fields.forEach(val => {
                        if(fieldNameAndRecordMap.has(val.name)){
                            let fieldRec = fieldNameAndRecordMap.get(val.name);
                            fieldRec.permissionable = val.permissionable;
                            fieldRec.updateable = val.updateable;
                            fieldNameAndRecordMap.set(val.name, fieldRec);
                        }else{
                            fieldNameAndRecordMap.set(val.name, {
                                name: val.name,
                                label: val.label,
                                permissionable: val.permissionable,
                                updateable: val.updateable
                            });
                        }
                    });
                    console.log('$fieldNameAndRecordMap: ',fieldNameAndRecordMap);
                    getFieldPermissions();
                }
            }).catch((err) => {
                console.error('$err-msg: ',err.message);
                console.error('$err-code: ',err.errorCode);
            });
            // getFieldPermissions();
        }
    }).catch((err) => {
        console.error('$err-msg: ',err.message);
        console.error('$err-code: ',err.errorCode);
    });
}
/* function getObjectFields() {
    var myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer " + sessionId);

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
    };

    fetch(baseUrl + "/services/data/v60.0/sobjects/"+selectedObject+"/describe", requestOptions).then(response => response.json()).then(result => {
        console.log(`$describe-${selectedObject}: `, result);
        console.log(`$fields: `, result.fields);
        if(result.fields){
            fieldNameAndRecordMap = new Map();
            result.fields.forEach(val => {
                fieldNameAndRecordMap.set(val.name, val);
            });
            console.log('$fieldNameAndRecordMap: ',fieldNameAndRecordMap);
            getFieldPermissions();
        }
    }).catch(err => {
        console.error('$err-msg: ',err.message);
        console.error('$err-code: ',err.errorCode);
    });
} */
function getFieldPermissions(){
    showSpinner();
    let fields_array = [
        'Id', 'Field', 'PermissionsEdit', 'PermissionsRead'
    ];
    let q = `SELECT ${fields_array.join(',')} FROM FieldPermissions Where SobjectType = '${selectedObject}' AND ParentId = '${psNameRecordMap.get(selectedPermissionset).PermissionSetId}'`;
    console.log('$q: ',q);
    conn.query(q).then(res => {
        console.log('$res: ',res);
        if(res.records){
            console.log('$FieldPermissions: ',res.records);
            fieldNameAndPermissionRecodMap = new Map();
            res.records.forEach(val => {
                fieldNameAndPermissionRecodMap.set(val.Field.split('.').at(1), val);
            });
            console.log('$fieldNameAndPermissionRecodMap: ',fieldNameAndPermissionRecodMap);
            generateFieldsPermissionsList();
            hideSpinner();
            $('.dropdown_contents_ps').addClass('hide');
            $('.dropdown_contents_obj').addClass('hide');
        }
    }).catch( err => {
        console.error('$err-msg: ',err.message);
        console.error('$err-code: ',err.errorCode);
    });
}
let search = '';
$(document).on('input', '.inp_fields_filter', function (e){
   search = $(this).val().trim();
   if(search.length > 1){
        generateFieldsPermissionsList();
   }
   if(search.length == 1 && access_filter != 'All'){
        access_filter = 'All';
        $('.All').prop('selected','true');
        generateFieldsPermissionsList();
   }
});

$(document).on('keyup', '.inp_fields_filter', function (e){
    search = $(this).val().trim();
    let charCode = (e.which) ? e.which : e.keyCode;
    if(charCode == 8 && search.length < 2) {
        search = '';
        generateFieldsPermissionsList();
    }
});
let access_filter = 'All';
$(document).on('input', '.access_dropdown', function (e){
   access_filter = $(this).val().trim();
   console.log('access_filter: ',access_filter);
   $('.inp_fields_filter').val('');
   search = '';
   generateFieldsPermissionsList();
});
function generateFieldsPermissionsList(){
    let rows = '';
    let labelPsFieldMap = new Map();
    labelPsFieldMap.set('Read','PermissionsRead');
    labelPsFieldMap.set('Edit','PermissionsEdit');
    let psNames = ['Read', 'Edit'];
    fieldNameAndRecordMap.forEach((value, key) => {
        if(search && key.toLowerCase().includes(search.toLowerCase())){
            let ps_subcontainer = '';
            psNames.forEach(psnm => {
                let checked = '';
                let recordId = '';
                if(fieldNameAndPermissionRecodMap.has(key)){
                    let psRec = fieldNameAndPermissionRecodMap.get(key);
                    checked = `${psRec[labelPsFieldMap.get(psnm)] ? 'checked' : ''}`;
                    recordId = `data-recid="${psRec.Id}"`;
                }
                let disabled = `${fieldNameAndRecordMap.get(key).permissionable ? '' : 'disabled'}`;
                let graylabelclass = `${fieldNameAndRecordMap.get(key).permissionable ? '' : 'gray'}`;
                if(!disabled && psnm == 'Edit'){
                    disabled = `${fieldNameAndRecordMap.get(key).updateable ? '' : 'disabled'}`;
                }
                ps_subcontainer += `
                    <div class="ps_subcontainer">
                        <div class="ps_sub_l">
                            <label class="ps_lbl ${graylabelclass}">${psnm}</label>
                        </div>
                        <div class="ps_sub_r">
                            <input type="checkbox" class="ps_chk" data-profile="${key}" data-fieldApiName="${key}" data-field=${labelPsFieldMap.get(psnm)} ${checked} ${recordId} ${disabled}/>
                        </div>
                    </div>
                `;
            });
            let non_permissionable_cls = fieldNameAndRecordMap.get(key)?.permissionable ? '' : 'non_permissionable_cls';
            rows += `<tr class="tr">
                <td class="td ps_name_td ${non_permissionable_cls}" data-name="${key}" title="${fieldNameAndRecordMap.get(key)?.label}" data-recid="${fieldNameAndPermissionRecodMap.get(key)?.Id}">${key}</td>
                <td class="td"><div class="ps_container">${ps_subcontainer}</div></td>
            </tr>`;
        }else if(!search){
            if(access_filter == 'All'){
                let ps_subcontainer = '';
                psNames.forEach(psnm => {
                    let checked = '';
                    let recordId = '';
                    if(fieldNameAndPermissionRecodMap.has(key)){
                        let psRec = fieldNameAndPermissionRecodMap.get(key);
                        checked = `${psRec[labelPsFieldMap.get(psnm)] ? 'checked' : ''}`;
                        recordId = `data-recid="${psRec.Id}"`;
                    }
                    let disabled = `${fieldNameAndRecordMap.get(key).permissionable ? '' : 'disabled'}`;
                    let graylabelclass = `${fieldNameAndRecordMap.get(key).permissionable ? '' : 'gray'}`;
                    if(!disabled && psnm == 'Edit'){
                        disabled = `${fieldNameAndRecordMap.get(key).updateable ? '' : 'disabled'}`;
                    }
                    ps_subcontainer += `
                        <div class="ps_subcontainer">
                            <div class="ps_sub_l">
                                <label class="ps_lbl ${graylabelclass}">${psnm}</label>
                            </div>
                            <div class="ps_sub_r">
                                <input type="checkbox" class="ps_chk" data-profile="${key}" data-fieldApiName="${key}" data-field=${labelPsFieldMap.get(psnm)} ${checked} ${recordId} ${disabled}/>
                            </div>
                        </div>
                    `;
                });
                let non_permissionable_cls = fieldNameAndRecordMap.get(key)?.permissionable ? '' : 'non_permissionable_cls';
                rows += `<tr class="tr">
                    <td class="td ps_name_td ${non_permissionable_cls}" data-name="${key}" title="${fieldNameAndRecordMap.get(key)?.label}" data-recid="${fieldNameAndPermissionRecodMap.get(key)?.Id}">${key}</td>
                    <td class="td"><div class="ps_container">${ps_subcontainer}</div></td>
                </tr>`;
            }else{
                if(fieldNameAndPermissionRecodMap.has(key) && fieldNameAndPermissionRecodMap.get(key)[access_filter]){
                    let ps_subcontainer = '';
                    psNames.forEach(psnm => {
                        let checked = '';
                        let recordId = '';
                        if(fieldNameAndPermissionRecodMap.has(key)){
                            let psRec = fieldNameAndPermissionRecodMap.get(key);
                            checked = `${psRec[labelPsFieldMap.get(psnm)] ? 'checked' : ''}`;
                            recordId = `data-recid="${psRec.Id}"`;
                        }
                        let disabled = `${fieldNameAndRecordMap.get(key).permissionable ? '' : 'disabled'}`;
                        let graylabelclass = `${fieldNameAndRecordMap.get(key).permissionable ? '' : 'gray'}`;
                        if(!disabled && psnm == 'Edit'){
                            disabled = `${fieldNameAndRecordMap.get(key).updateable ? '' : 'disabled'}`;
                        }
                        ps_subcontainer += `
                            <div class="ps_subcontainer">
                                <div class="ps_sub_l">
                                    <label class="ps_lbl ${graylabelclass}">${psnm}</label>
                                </div>
                                <div class="ps_sub_r">
                                    <input type="checkbox" class="ps_chk" data-profile="${key}" data-fieldApiName="${key}" data-field=${labelPsFieldMap.get(psnm)} ${checked} ${recordId} ${disabled}/>
                                </div>
                            </div>
                        `;
                    });
                    let non_permissionable_cls = fieldNameAndRecordMap.get(key)?.permissionable ? '' : 'non_permissionable_cls';
                    rows += `<tr class="tr">
                        <td class="td ps_name_td ${non_permissionable_cls}" data-name="${key}" title="${fieldNameAndRecordMap.get(key)?.label}" data-recid="${fieldNameAndPermissionRecodMap.get(key)?.Id}">${key}</td>
                        <td class="td"><div class="ps_container">${ps_subcontainer}</div></td>
                    </tr>`;
                }
            }
            
        }
    });

    $('.tbody').html(rows);
    document.title = doc_title + ` [ ${$('.tr').length} ] `;
}
function getFilteredOBJList(searchTerm){
    let list = [];
    objectsNameList.forEach(val => {
        if(searchTerm && !val.toLowerCase().includes(searchTerm.toLowerCase())){
            return;
        }else{
            list.push(val);
        }
    });
    return list;
}
$(document).on('click', '.d_li_obj', function (e) {
    let text = $(this).text().trim();
    console.log('$text: ', text);
    $('.dropdown_inp_obj').val(text);
    $('.dropdown_contents_obj').addClass('hide');

    selectedObject = text;
    if(selectedPermissionset){
        console.log('$selectedObject: ',selectedObject);
        console.log('$selectedPermissionset: ',selectedPermissionset);
        showSpinner();
        getObjectFields();
    }
});
function setObjDropDownDivWidth() {
    var inputWidth = $('.dropdown_inp_obj').width();
    $('.dropdown_contents_obj').width(inputWidth + 8);
}
/* Generate OBJ Dropdowns Ends */