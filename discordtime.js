// Friendly names for FFXIV players; spacetime only knows IANA ids, so these map to GMT
const customTimezones = {
    "Eorzean ST (GMT-0)": "Etc/GMT",
    "Server Time (GMT-0)": "Etc/GMT"
};
function resolveTimezone(tz) {
    return customTimezones[tz] || tz;
}

// Discord renders timestamps with the viewer's locale, so the previews use Intl the same way
const FORMATS = [
    { code: "t", name: "Short time", options: { timeStyle: "short" } },
    { code: "T", name: "Long time", options: { timeStyle: "medium" } },
    { code: "d", name: "Short date", options: { year: "numeric", month: "2-digit", day: "2-digit" } },
    { code: "D", name: "Long date", options: { dateStyle: "long" } },
    { code: "f", name: "Date and time", options: { dateStyle: "long", timeStyle: "short" } },
    { code: "F", name: "Full date and time", options: { dateStyle: "full", timeStyle: "short" } },
    { code: "R", name: "Relative" }
];

const RELATIVE_UNITS = [
    ["year", 365 * 24 * 3600],
    ["month", 30 * 24 * 3600],
    ["day", 24 * 3600],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1]
];

var time;
var selectedTimezone = "Eorzean ST (GMT-0)";
var allTimezones = [];

const $ = (id) => document.getElementById(id);

// Query string shortcut: ?8pm, ?8pm-europe/amsterdam, or ?8pmst for Server Time
const urlSearchParams = Object.fromEntries(new URLSearchParams(window.location.search).entries());
var querytime = Object.keys(urlSearchParams)[0] || "";
var querytimezone = "";
if (querytime.split("-")[1]) {
    querytimezone = querytime.split("-")[1];
}
if (querytime.toLowerCase().endsWith("st")) {
    querytimezone = "Server Time (GMT-0)";
}

document.addEventListener("DOMContentLoaded", function () {
    time = spacetime.now().seconds(0);
    $("localTimezone").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || time.timezone().name;

    allTimezones = Object.keys(spacetime.timezones())
        .concat(Object.keys(customTimezones))
        .sort();
    $("timezoneList").innerHTML = allTimezones.map((tz) => `<option value="${tz}"></option>`).join("");

    buildFormatList();

    if (querytimezone && findTimezone(querytimezone)) {
        selectedTimezone = findTimezone(querytimezone);
    }
    time = time.goto(resolveTimezone(selectedTimezone));
    if (querytime) {
        time = time.time(querytime);
    }

    $("dtDate").addEventListener("change", setDateTime);
    $("dtTime").addEventListener("change", setDateTime);
    $("dtUnix").addEventListener("change", (e) => setUnix(e.target.value));
    $("dtTimezone").addEventListener("change", (e) => setTimezone(e.target.value));
    $("dtTimezone").addEventListener("focus", (e) => e.target.select());
    $("dtHuman").addEventListener("input", previewHuman);
    $("dtHuman").addEventListener("change", commitHuman);
    $("dtHuman").addEventListener("focus", (e) => e.target.select());
    $("dtHuman").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitHuman();
        }
    });
    $("nowButton").addEventListener("click", () => {
        time = spacetime.now().seconds(0).goto(resolveTimezone(selectedTimezone));
        updateAll();
    });
    document.querySelectorAll("[data-add]").forEach((button) => {
        button.addEventListener("click", () => {
            time = time.add(Number(button.dataset.add), button.dataset.unit);
            updateAll();
        });
    });

    updateAll();
    // Keep the relative preview honest as the clock moves on
    setInterval(renderFormats, 15000);
});

function findTimezone(name) {
    var lower = name.trim().toLowerCase();
    return allTimezones.find((tz) => tz.toLowerCase() === lower);
}

function unixSeconds() {
    return Math.floor(time.epoch / 1000);
}

function formatClock(epoch, timeZone) {
    var options = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
    try {
        return new Intl.DateTimeFormat(undefined, Object.assign({ timeZone: timeZone }, options)).format(epoch);
    } catch (err) {
        // A spacetime zone id the browser doesn't recognise
        return spacetime(epoch).goto(timeZone).format("{day-short} {month-short} {date}, {time}");
    }
}

function updateAll() {
    var zoned = time.goto(resolveTimezone(selectedTimezone));

    $("timezoneName").textContent = selectedTimezone;
    $("timezoneTime").textContent = formatClock(time.epoch, resolveTimezone(selectedTimezone));
    $("localTime").textContent = formatClock(time.epoch, undefined);

    $("dtDate").value = zoned.format("iso-short");
    $("dtTime").value = zoned.format("{hour-24-pad}:{minute-pad}");
    $("dtTimezone").value = selectedTimezone;
    $("dtUnix").value = unixSeconds();
    $("dtHuman").value = describeTime(time, resolveTimezone(selectedTimezone));
    $("dtHuman").removeAttribute("aria-invalid");
    setHumanHint(HUMAN_HINT);

    renderFormats();
}

const HUMAN_HINT = "Type a time any way you like, then press Enter.";

function setHumanHint(text, isError) {
    $("dtHumanHint").textContent = text;
    $("dtHumanHint").classList.toggle("is-error", Boolean(isError));
}

function parseHumanInput() {
    var zone = resolveTimezone(selectedTimezone);
    return parseHumanTime($("dtHuman").value, zone, time);
}

// Live feedback while typing; nothing changes until Enter or leaving the field
function previewHuman() {
    var result = parseHumanInput();
    $("dtHuman").removeAttribute("aria-invalid");
    if (result.time) {
        setHumanHint("→ " + fullDateText(result.time.goto(resolveTimezone(selectedTimezone))));
    } else {
        setHumanHint(result.error || HUMAN_HINT, Boolean(result.error));
    }
}

function commitHuman() {
    if (!$("dtHuman").value.trim()) {
        updateAll();
        return;
    }
    var result = parseHumanInput();
    if (result.time) {
        time = result.time;
        updateAll();
    } else {
        $("dtHuman").setAttribute("aria-invalid", "true");
        setHumanHint(result.error, true);
    }
}

function setDateTime() {
    var date = $("dtDate").value;
    var clock = $("dtTime").value;
    if (!date || !clock) {
        updateAll();
        return;
    }
    time = spacetime(`${date}T${clock}:00`, resolveTimezone(selectedTimezone));
    updateAll();
}

function setUnix(value) {
    var seconds = Number(value.trim());
    if (value.trim() !== "" && Number.isFinite(seconds)) {
        time = spacetime(seconds * 1000).goto(resolveTimezone(selectedTimezone));
    }
    updateAll();
}

function setTimezone(value) {
    var match = findTimezone(value);
    if (match) {
        selectedTimezone = match;
        time = time.goto(resolveTimezone(match));
    }
    updateAll();
}

function buildFormatList() {
    $("formats").innerHTML = FORMATS.map((format) => `
        <li>
            <button type="button" class="format" data-code="${format.code}">
                <code class="format-code"></code>
                <span class="format-preview"></span>
                <span class="format-name">${format.name}</span>
                <span class="format-copied" aria-live="polite"></span>
            </button>
        </li>`).join("");

    document.querySelectorAll(".format").forEach((row) => {
        row.addEventListener("click", () => copyFormat(row));
    });
}

function renderFormats() {
    var unix = unixSeconds();
    document.querySelectorAll(".format").forEach((row) => {
        var format = FORMATS.find((f) => f.code === row.dataset.code);
        row.querySelector(".format-code").textContent = `<t:${unix}:${format.code}>`;
        row.querySelector(".format-preview").textContent = format.options
            ? new Intl.DateTimeFormat(undefined, format.options).format(time.epoch)
            : formatRelative(time.epoch);
    });
}

function formatRelative(epoch) {
    var seconds = (epoch - Date.now()) / 1000;
    var rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });
    for (var [unit, size] of RELATIVE_UNITS) {
        if (Math.abs(seconds) >= size || unit === "second") {
            return rtf.format(Math.round(seconds / size), unit);
        }
    }
}

function copyFormat(row) {
    var text = row.querySelector(".format-code").textContent;
    var status = row.querySelector(".format-copied");
    navigator.clipboard.writeText(text).then(function () {
        status.textContent = "Copied";
        row.classList.add("is-copied");
        clearTimeout(row.copyTimer);
        row.copyTimer = setTimeout(function () {
            row.classList.remove("is-copied");
            status.textContent = "";
        }, 1500);
    }, function (err) {
        console.error("Could not copy text: ", err);
    });
}
