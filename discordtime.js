
var time;
var selectedTimezone;

$(function () {
    time = spacetime.now().seconds(0);
    selectedTimezone = "Eorzean ST (GMT-0)"
    $("#localTimezone").text(time.timezone().name);

    var allTimezones = spacetime.timezones();
	allTimezones["Eorzean ST (GMT-0)"] = {offset: -0, hem: 'n'}
	allTimezones["Server Time (GMT-0)"] = {offset: -0, hem: 'n'}
    var allTimezones = Object.keys(allTimezones).sort();
    allTimezones.forEach(function (tz, index) {
        $("#dtTimezone").append(`<option value="${tz}">${tz}</option>`)
    });
    
    updateAll();
	$('select').select2({
		theme: 'bootstrap-5',
	});

});

function copyToClip(value) {
    navigator.clipboard.writeText(value);
}

function updateAll() {
    var unix = Math.floor(time.epoch / 1000);
    $("#localTime").text(time.goto(null).format('nice-full'))
	
	$("#timezoneName").text(selectedTimezone)
	
    $("#timezoneTime").text(time.goto(selectedTimezone).format('nice-full'))


    $("#dtUnix").val(unix)
    $("#dtText").val(time.format('iso'))

    $("#dtTimezone").val(selectedTimezone)
	$('select').select2();
	
    calculateDiscordNotations(unix);
}

function setUnix(unixTime) {
    time = spacetime(unixTime * 1000);
    updateAll();
}
function setText(text) {
    time = spacetime(text);
    updateAll();
}
function setTimezone(timezone) {
    time = time.goto(timezone);
    selectedTimezone = timezone;
    updateAll();
}
function addMinutes(minutes) {
    time = time.add(minutes, 'minutes');
    updateAll();
}
function addHours(hours) {
    time = time.add(hours, 'hours');
    updateAll();
}
function addDays(days) {
    time = time.add(days, 'days');
    updateAll();
}

function calculateDiscordNotations(unix) {
    calct(unix);
    calcT(unix);
    calcd(unix);
    calcD(unix);
    calcf(unix);
    calcF(unix);
    calcR(unix);
    
}

function calct(unix) {
    $("#disctNotation").text("<t:" + unix + ":t>");
    $("#disctOutput").text(time.goto(null).format('{hour}:{minute-pad} {AMPM}'));
}

function calcT(unix) {
    $("#discTNotation").text("<t:" + unix + ":T>");
    $("#discTOutput").text(time.goto(null).format('{hour}:{minute-pad}:{second-pad} {AMPM}'));
}

function calcd(unix) {
    $("#discdNotation").text("<t:" + unix + ":d>");
    $("#discdOutput").text(time.goto(null).format('{iso-month}/{date-pad}/{year}'));
}

function calcD(unix) {
    $("#discDNotation").text("<t:" + unix + ":D>");
    $("#discDOutput").text(time.goto(null).format('{month} {date-pad}, {year}'));
}

function calcf(unix) {
    $("#discfNotation").text("<t:" + unix + ":f>");
    $("#discfOutput").text(time.goto(null).format('{month} {date}, {year} {hour}:{minute-pad} {AMPM}'));
}

function calcF(unix) {
    $("#discFNotation").text("<t:" + unix + ":F>");
    $("#discFOutput").text(time.goto(null).format('{day}, {month} {date}, {year} {hour}:{minute-pad} {AMPM}'));
}

function calcR(unix) {
    $("#discRNotation").text("<t:" + unix + ":R>");
    var timediff = 0;
    var diffUnit = '';
    if (Math.abs(spacetime.now().diff(time).years) > 0) {
        timediff = spacetime.now().diff(time).years;
        diffUnit = 'years';
    }
    else if (Math.abs(spacetime.now().diff(time).months) > 0) {
        timediff = spacetime.now().diff(time).months;
        diffUnit = 'months';
    }
    else if (Math.abs(spacetime.now().diff(time).weeks) > 0) {
        timediff = spacetime.now().diff(time).weeks;
        diffUnit = 'weeks';
    }
    else if (Math.abs(spacetime.now().diff(time).days) > 0) {
        timediff = spacetime.now().diff(time).days;
        diffUnit = 'days';
    }
    else if (Math.abs(spacetime.now().diff(time).hours) > 0) {
        timediff = spacetime.now().diff(time).hours;
        diffUnit = 'hours';
    }
    else if (Math.abs(spacetime.now().diff(time).minutes) > 0) {
        timediff = spacetime.now().diff(time).minutes;
        diffUnit = 'minutes';
    }
    else {
        timediff = spacetime.now().diff(time).seconds;
        if (timediff > 0) {
            $("#discROutput").text('in a few seconds');
        }
        else {
            $("#discROutput").text('a few seconds ago');
        }
        return;
    }

    if (timediff > 0) {
        $("#discROutput").text('in ' + timediff + ' ' + diffUnit);
    }
    else {
        $("#discROutput").text(Math.abs(timediff) + ' ' + diffUnit + ' ago.');
    }
}