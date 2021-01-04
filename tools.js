// DO NOT CHANGE
module.exports = {
    getConnectionConfig: function () {
        const config = require('config')
        if (config.has('database')) {
            const dbSettings = config.get('database')
            if (dbSettings.host === 'replace-host' || dbSettings.user === 'replace-user' || dbSettings.password === 'replace-pass') {
                return null
            } else {
                return dbSettings
            }
        }
    },
    timeAndDate: function () {
        let date = new Date();
        let day = ("0" + date.getDate()).slice(-2);
        let month = ("0" + (date.getMonth() + 1)).slice(-2)
        let year = date.getFullYear();
        let hour = date.getHours();
        let minute = date.getMinutes();
        let seconds = date.getSeconds();
        return year + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + seconds;
    }
}