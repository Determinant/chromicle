window.onload = function() {
    chrome.identity.getAuthToken({interactive: true}, function(token) {
        fetch('https://www.googleapis.com/calendar/v3' + '/users/me/calendarList' + '?access_token=' + token,
            { method: 'GET', async: true }).then((response) => response.json()).then(function(data) {
                var test = document.getElementById('test');
                data.items.map(e => e.summary).forEach(function(e) {
                    var entry = document.createElement('li');
                    entry.innerText = e;
                    test.appendChild(entry);
                });
            });
    });
};
