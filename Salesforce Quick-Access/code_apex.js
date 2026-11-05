let baseUrl;
let sessionId;
$(document).ready(function() {
    Prism.highlightAll();
    let url = new URL(window.location.href);
    console.log('$url: ', url);
    let Name = url.searchParams.get('Name');
    console.log('$Name: ', Name);
    document.title = Name + '.cls';
    let recordId = url.searchParams.get('recordId');
    console.log('$recordId: ', recordId);
    baseUrl = url.searchParams.get('baseUrl');
    console.log('$baseUrl: ', baseUrl);
    sessionId = url.searchParams.get('sessionId');
    console.log('$sessionId: ', sessionId);
   
    const endpoint = `${baseUrl}/services/data/v59.0/tooling/sobjects/ApexClass/${recordId}`;

    fetch(endpoint, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + sessionId }
    }).then(response => response.json()).then(data => {
        console.log(data);
        let resource = data;
        console.log('$resource: ', resource);
        $('.codesection').text(resource.Body);
        Prism.highlightAll();
    }).catch(error => {
        console.error('Error:', error);
    });
});