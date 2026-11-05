let Name;
let baseUrl;
let recordId;
let sessionId;
let currentClass;
let resourceFIles;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    Name = url.searchParams.get('Name');
    console.log('$Name: ', Name);
    document.title = Name + ' - LWC';
    recordId = url.searchParams.get('recordId');
    console.log('$recordId: ', recordId);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);

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
        resourceFIles = [];
        resources.records.forEach(val => {
            let order = 1;
            let languageClass;
            if (val.FilePath.endsWith('.js')) {
                order = 1;
                languageClass = 'language-js';
            } else if (val.FilePath.endsWith('.html')) {
                order = 2;
                languageClass = 'language-html';
            } else if (val.FilePath.endsWith('.css')) {
                order = 3;
                languageClass = 'language-css';
            } else if (val.FilePath.endsWith('.xml')) {
                order = 4;
                languageClass = 'language-xml';
            }
            resourceFIles.push(
                {
                    FilePath: val.FilePath.split('/')[2],
                    Source: val.Source,
                    Order: order,
                    languageClass: languageClass
                }
            );
        });
        resourceFIles.sort(function (a, b) { return parseInt(a.Order) - parseInt(b.Order) });
        console.log('$resourceFIles: ', resourceFIles);
        let tabs = '';
        resourceFIles.forEach((val, index) => {
            let active = index == 0 ? 'active' : '';
            tabs += `<div class="l_c_1_c ${active}" data-file="${val.FilePath}">${val.FilePath}</div>`;
        });
        $('.l_c_1').html(tabs);
        currentClass = resourceFIles[0].languageClass;
        $('.codesection').addClass(currentClass);
        $('.codesection').text(resourceFIles[0].Source);
        Prism.highlightAll();
    }).catch(error => {
        console.log('$getObjects: error', error);
    });
});
$(document).on('click', '.l_c_1_c', function (e) {
    $('.l_c_1_c').removeClass('active');
    $(this).addClass('active');
    let file = $(this).attr('data-file');
    console.log('$file: ', file);
    file = resourceFIles.find(res => {
        return res.FilePath == file;
    });
    console.log('$file: ', file);
    $('.codesection').removeClass(currentClass);
    currentClass = file.languageClass;
    $('.codesection').addClass(currentClass);
    $('.codesection').text(file.Source);
    Prism.highlightAll();
});