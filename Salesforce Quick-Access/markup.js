let Name;
let baseUrl;
let recordId;
let sessionId;
let langClass;
let metadataName;
$(document).ready(function () {
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    langClass = url.searchParams.get('langClass');
    console.log('$langClass: ', langClass);
    metadataName = url.searchParams.get('metadataName');
    console.log('$metadataName: ', metadataName);
    Name = url.searchParams.get('Name');
    console.log('$Name: ', Name);
    document.title = Name;
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

    fetch(baseUrl + '/services/data/v59.0/sobjects/' + metadataName + '/' + recordId, requestOptions).then(response => response.json()).then(resource => {
        console.log('$resource: ', resource);
        $('.codesection').addClass(langClass);
        $('.codesection').text(resource.Markup);
        Prism.highlightAll();
    }).catch(error => {
        console.log('$getObjects: error', error);
    });
});