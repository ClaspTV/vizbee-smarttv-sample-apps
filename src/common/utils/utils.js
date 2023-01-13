export default class Utils {

    /**
     * Convert mislliseconds to string format 00:00:00 or 00:00
     * 
     * @param {*} ms - milliseconds input
     * @param {*} hourFormatNeeded - flag that represents whether the output format needed hours in it
     */
    static millisecondsToString(ms, hourFormatNeeded) {

        var return_string = "";
        var numms = Math.floor((((ms % 31536000) % 86400) % 3600) % 60);

        if (isNaN(numms) || numms <= 0) {
            return_string = ":" + "00";
        } else if (numms < 10) {
            return_string = ":0" + numms;
        } else {
            return_string = ":" + numms;
        }

        var numminutes = Math.floor((((ms % 31536000) % 86400) % 3600) / 60);
        if (isNaN(numminutes) || numminutes <= 0) {
            return_string = "00" + return_string;
        } else if (numminutes < 10) {
            return_string = "0" + numminutes + return_string;
        } else {
            return_string = numminutes + return_string;
        }

        var numhours = Math.floor(((ms % 31536000) % 86400) / 3600);
        if (hourFormatNeeded) {
            if (isNaN(numhours) || numhours <= 0) {
                return_string = "00:" + return_string;
            } else if (numhours < 10) {
                return_string = "0" + numhours + ":" + return_string;
            } else {
                return_string = numhours + ":" + return_string;
            }
        } else {
            if (numhours > 0) {
                return_string = numhours + ":" + return_string;
            }
        }

        return return_string;
    }

    static readJSONFile(url, callback) {
        let xhr = new XMLHttpRequest();
        xhr.timeout = 10000;
        xhr.onreadystatechange = function (e) {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    callback(xhr.status, JSON.parse(xhr.response));
                } else {
                    callback(xhr.status, null)
                }
            }
        }
        xhr.ontimeout = function () {
            console.log('XHR Timeout');
        }
        xhr.open('get', url, true)
        xhr.send();
    }
}