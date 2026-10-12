// Free-form time parsing ("8pm tomorrow", "1700 last thursday", "next week sunday at a quarter past 2")
// and the matching human readable description. Needs spacetime; everything is resolved in the given zone.

const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)";
const UNIT_RE = "(?:seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|fortnights?|months?|mos?|years?|yrs?|y)(?![a-z])";
const SPANS_RE = `((?:\\d+(?:\\.\\d+)?\\s*${UNIT_RE}\\s*(?:and\\s+)?)+)`;
const ORDINAL_RE = "(?:st|nd|rd|th)?";

const NUMBER_WORDS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50
};
const ORDINAL_WORDS = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
    eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
    eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30
};
const SHIFTS = { next: 1, coming: 1, last: -1, previous: -1, prev: -1, past: -1, this: 0, current: 0 };
// Default clock time when only a part of the day is given ("tomorrow morning")
const PERIOD_HOURS = { morning: 9, afternoon: 15, evening: 19, night: 21 };
const UNIT_MINUTES = { minute: 1, hour: 60, day: 1440, week: 10080 };

// Follow the browser's preference for 12 or 24 hour clocks, and for 3/4 vs 4/3 dates
const HOUR12 = (() => {
    try {
        return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 === true;
    } catch (err) {
        return false;
    }
})();
const MONTH_FIRST = (() => {
    try {
        var parts = new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" }).formatToParts(0);
        return parts.findIndex((p) => p.type === "month") < parts.findIndex((p) => p.type === "day");
    } catch (err) {
        return false;
    }
})();

function pad2(n) {
    return String(n).padStart(2, "0");
}

function monthIndex(word) {
    return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(word.slice(0, 3)) + 1;
}

function weekdayIndex(word) {
    return ["su", "mo", "tu", "we", "th", "fr", "sa"].indexOf(word.slice(0, 2));
}

function spanUnit(word) {
    if (word.startsWith("mo")) return ["month", 1];
    if (word.startsWith("m")) return ["minute", 1];
    if (word.startsWith("s")) return ["second", 1];
    if (word.startsWith("h")) return ["hour", 1];
    if (word.startsWith("d")) return ["day", 1];
    if (word.startsWith("w")) return ["week", 1];
    if (word.startsWith("f")) return ["week", 2];
    return ["year", 1];
}

function addSpans(list, text, sign) {
    for (var match of text.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
        var [unit, factor] = spanUnit(match[2]);
        list.push({ amount: sign * factor * Number(match[1]), unit: unit });
    }
}

function applySpan(t, span) {
    if (Number.isInteger(span.amount)) return t.add(span.amount, span.unit);
    if (span.unit === "second") return t.add(Math.round(span.amount), "second");
    if (UNIT_MINUTES[span.unit]) return t.add(Math.round(span.amount * UNIT_MINUTES[span.unit]), "minute");
    return t.add(Math.round(span.amount * (span.unit === "month" ? 30 : 365)), "day");
}

// Midnight of y-m-d in the zone, or null when that date doesn't exist
function makeDay(y, m, d, zone) {
    try {
        var t = spacetime(`${y}-${pad2(m)}-${pad2(d)}T00:00:00`, zone);
        return t.isValid() && t.year() === y && t.month() === m - 1 && t.date() === d ? t : null;
    } catch (err) {
        return null;
    }
}

// The valid candidate closest to today, so "jan 5" in October means next January.
// Past days count triple, since people mostly schedule ahead ("the 3rd" on the 12th is next month).
function nearestDay(candidates, today, zone) {
    var best = null;
    var bestDistance = Infinity;
    for (var [y, m, d] of candidates) {
        var day = makeDay(y, m, d, zone);
        var distance = day && (day.epoch < today.epoch ? 3 * (today.epoch - day.epoch) : day.epoch - today.epoch);
        if (day && distance < bestDistance) {
            best = day;
            bestDistance = distance;
        }
    }
    return best;
}

// Returns { time } on success, or { error } with a message for the user
function parseHumanTime(input, zone, clockSource) {
    var s = ` ${input.toLowerCase()} `
        .replace(/[’`]/g, "'")
        .replace(/\b([ap])\.m\b\.?/g, "$1m")
        .replace(/[,;!?()]/g, " ")
        .replace(/([a-z])-(?=[a-z])/g, "$1 ")
        .replace(/\b(\d{1,2})h(\d{2})\b/g, "$1:$2")
        .replace(/\b(twenty|thirty|forty|fifty)\s+(one|two|three|four|five|six|seven|eight|nine)\b/g,
            (m, tens, ones) => NUMBER_WORDS[tens] + NUMBER_WORDS[ones])
        .replace(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "g"), (m) => NUMBER_WORDS[m])
        .replace(new RegExp(`\\b(${Object.keys(ORDINAL_WORDS).join("|")})(?=\\s+(?:of\\s+)?${MONTH_RE}\\b)`, "g"),
            (m) => ORDINAL_WORDS[m] + "th")
        .replace(new RegExp(`\\bthe\\s+(${Object.keys(ORDINAL_WORDS).join("|")})\\b`, "g"), (m, word) => ORDINAL_WORDS[word] + "th")
        .replace(/\b(?:an?|1)\s+hour\s+and\s+a\s+half\b/g, " 90 minutes ")
        .replace(/\b(\d+)\s+hours?\s+and\s+a\s+half\b/g, (m, n) => ` ${n * 60 + 30} minutes `)
        .replace(/\bhalf\s+(?:an?\s+)?hour\b/g, " 30 minutes ")
        .replace(/\b(?:a\s+)?quarter\s+(?:of\s+)?(?:an?\s+)?hour\b/g, " 15 minutes ")
        .replace(/\ba\s+couple\s+(?:of\s+)?/g, " 2 ")
        .replace(/\ba\s+few\s+/g, " 3 ")
        .replace(/\ban?\s+(?=(?:sec|min|hour|hr|day|week|fortnight|month|year))/g, " 1 ");

    var p = { offsets: [] };

    // Replaces every match with a space, unless the handler returns false to leave it for later rules
    function take(pattern, handler) {
        s = s.replace(new RegExp(pattern, "g"), function () {
            return handler.apply(null, arguments) === false ? arguments[0] : " ";
        });
    }

    function setTime(hour, minute, meridiem, guess) {
        hour = Number(hour);
        minute = Number(minute);
        if (p.hour != null || minute > 59 || hour > 24 || (meridiem && (hour < 1 || hour > 12))) return false;
        p.hour = hour;
        p.minute = minute;
        p.meridiem = meridiem;
        p.guess = guess;
    }

    function setDate(y, m, d) {
        if (p.date || m < 1 || m > 12 || d < 1 || d > 31) return false;
        if (y != null && y < 100) y += 2000;
        p.date = { y: y, m: m, d: d };
    }

    // Relative offsets: "in 2 hours", "3 days ago", "2h30m from now", "+90m"
    take(`\\b(?:in|within|after)\\s+${SPANS_RE}`, (m, spans) => addSpans(p.offsets, spans, 1));
    take(`\\b${SPANS_RE}\\s*(?:ago|before now|earlier|back)\\b`, (m, spans) => addSpans(p.offsets, spans, -1));
    take(`\\b${SPANS_RE}\\s*(?:from now|later|hence|after now|from today)\\b`, (m, spans) => addSpans(p.offsets, spans, 1));
    take(`(^|\\s)([+-])\\s*${SPANS_RE}`, (m, lead, sign, spans) => addSpans(p.offsets, spans, sign === "-" ? -1 : 1));

    // Named days and parts of the day
    take("\\b(?:right\\s+)?now\\b", () => { p.now = true; });
    take("\\b(?:the\\s+)?day\\s+after\\s+tomorrow\\b|\\bovermorrow\\b", () => { p.dayOffset = 2; });
    take("\\b(?:the\\s+)?day\\s+before\\s+yesterday\\b", () => { p.dayOffset = -2; });
    take("\\b(?:tomorrow|tomorow|tommorow|tommorrow|tmrw|tmr|tmrw|2morrow|2moro)\\b", () => { p.dayOffset = 1; });
    take("\\byesterday\\b", () => { p.dayOffset = -1; });
    take("\\b(?:today|tdy)\\b", () => { p.dayOffset = 0; });
    take("\\blast\\s+night\\b", () => { p.dayOffset = -1; p.period = "night"; });
    take("\\bto(?:night|nite)\\b", () => { p.dayOffset = p.dayOffset == null ? 0 : p.dayOffset; p.period = "night"; });
    take("\\b(?:this|in\\s+the|at)?\\s*(morning|afternoon|evening|night)\\b", (m, period) => { p.period = period; });
    take("\\b(?:12\\s*)?(noon|midday|midnight)\\b", (m, word) => setTime(word === "midnight" ? 0 : 12, 0, null, false));

    // Week, month and year shifts: "next week", "last month", "the week after next"
    take("\\b(?:the\\s+)?week\\s+after\\s+next\\b", () => { p.weekShift = 2; });
    take("\\b(next|last|previous|prev|past|this|coming|current)\\s+(week|month|year)\\b", (m, which, unit) => { p[unit + "Shift"] = SHIFTS[which]; });
    take("\\b(?:(next|last|this|coming)\\s+)?weekend\\b", (m, which) => { p.weekday = 6; p.weekdayMode = which || "this"; });

    // Calendar dates
    take("\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b", (m, y, mo, d) => setDate(+y, +mo, +d));
    take(`\\b(\\d{1,2})${ORDINAL_RE}\\s+(?:of\\s+)?${MONTH_RE}\\b(?:\\s+(\\d{4}))?`,
        (m, d, mon, y) => setDate(y ? +y : null, monthIndex(mon), +d));
    take(`\\b${MONTH_RE}\\s+(?:the\\s+)?(\\d{1,2})${ORDINAL_RE}(?![\\d:.]|\\s*(?:[ap]m|o'?\\s*clock)\\b)(?:\\s+(\\d{4}))?\\b`,
        (m, mon, d, y) => setDate(y ? +y : null, monthIndex(mon), +d));
    take("\\b(\\d{1,2})[/-](\\d{1,2})(?:[/.-](\\d{4}|\\d{2}))?\\b|\\b(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})\\b", (m, a, b, y, a2, b2, y2) => {
        a = Number(a || a2);
        b = Number(b || b2);
        y = y || y2;
        var monthFirst = a > 12 ? false : b > 12 ? true : MONTH_FIRST;
        return monthFirst ? setDate(y ? +y : null, a, b) : setDate(y ? +y : null, b, a);
    });
    take("\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\b", (m, d) => {
        if (p.dayOnly || p.date) return false;
        p.dayOnly = Number(d);
    });

    // Weekdays: "sunday", "next friday", "last thursday", "this sat"
    take(`\\b(?:(next|this|coming|last|previous|past)\\s+)?${WEEKDAY_RE}\\b`, (m, which, day) => {
        p.weekday = weekdayIndex(day);
        p.weekdayMode = which || null;
    });

    // Clock times
    take("\\b(?:a\\s+)?(quarter|half|\\d{1,2})\\s+(?:minutes?\\s+)?(past|after|to|before|till|til|of)\\s+(\\d{1,2})\\b(?:\\s*([ap]m)\\b)?",
        (m, amount, rel, hour, meridiem) => {
            var minutes = amount === "quarter" ? 15 : amount === "half" ? 30 : Number(amount);
            if (minutes > 59 || setTime(hour, 0, meridiem, true) === false) return false;
            p.minuteDelta = /past|after/.test(rel) ? minutes : -minutes;
        });
    take("\\bhalf\\s+(\\d{1,2})\\b(?:\\s*([ap]m)\\b)?", (m, hour, meridiem) => setTime(hour, 30, meridiem, true));
    take("\\b(\\d{1,2})[:.](\\d{2})(?::\\d{2})?(?:\\s*([ap]m)\\b)?(?!\\d)", (m, hour, minute, meridiem) => setTime(hour, minute, meridiem, false));
    take("\\b(\\d{1,2})\\s*([ap]m)\\b", (m, hour, meridiem) => setTime(hour, 0, meridiem, false));
    take("\\b(\\d{1,2})\\s*o'?\\s*clock\\b(?:\\s*([ap]m)\\b)?", (m, hour, meridiem) => setTime(hour, 0, meridiem, true));
    take("\\b(\\d{1,2})\\s+([0-5]\\d)\\b(?:\\s*([ap]m)\\b)?", (m, hour, minute, meridiem) => setTime(hour, minute, meridiem, true));
    take("\\b(\\d{3,4})(?:\\s*([ap]m)\\b|\\s*(?:h|hrs|hours)\\b)?", (m, digits, meridiem) =>
        setTime(digits.slice(0, -2), digits.slice(-2), meridiem, digits.length === 3));
    take("\\b(\\d{1,2})\\b", (m, hour) => setTime(hour, 0, null, true));

    var leftover = s
        .replace(/\b(?:at|on|the|of|in|and|by|around|about|approx|ish|from|for|starting|start|this|o'?clock|time)\b/g, " ")
        .replace(/[@.:+\-'/]/g, " ")
        .trim()
        .replace(/\s+/g, " ");
    if (leftover) {
        return { error: `Didn't understand “${leftover}”` };
    }

    var hasDate = p.date || p.dayOnly || p.dayOffset != null || p.weekday != null ||
        p.weekShift != null || p.monthShift != null || p.yearShift != null;
    if (!hasDate && p.hour == null && !p.period && !p.offsets.length && !p.now) {
        return { error: "" };
    }

    var now = spacetime.now().goto(zone).seconds(0);
    var today = now.startOf("day");
    var day = today;

    if (p.date) {
        day = p.date.y != null
            ? makeDay(p.date.y, p.date.m, p.date.d, zone)
            : nearestDay([-1, 0, 1].map((dy) => [today.year() + dy, p.date.m, p.date.d]), today, zone);
        if (!day) return { error: "That date doesn't exist" };
    } else if (p.dayOnly) {
        var shifts = p.monthShift != null ? [p.monthShift] : [-1, 0, 1];
        day = nearestDay(shifts.map((dm) => {
            var month = today.startOf("month").add(dm, "month");
            return [month.year(), month.month() + 1, p.dayOnly];
        }), today, zone);
        if (!day) return { error: "That date doesn't exist" };
    } else {
        if (p.dayOffset != null) day = day.add(p.dayOffset, "day");
        if (p.monthShift) day = day.add(p.monthShift, "month");
        if (p.yearShift) day = day.add(p.yearShift, "year");
        // Weeks run Monday to Sunday, so "next week sunday" is the Sunday after next Monday
        var isoDay = (weekday) => (weekday + 6) % 7;
        if (p.weekShift != null) {
            if (p.weekday != null) {
                day = day.add(7 * p.weekShift - isoDay(day.day()) + isoDay(p.weekday), "day");
            } else {
                day = day.add(7 * p.weekShift, "day");
            }
        } else if (p.weekday != null) {
            var ahead = (p.weekday - day.day() + 7) % 7;
            if (p.weekdayMode === "last" || p.weekdayMode === "previous" || p.weekdayMode === "past") {
                day = day.add(-((day.day() - p.weekday + 7) % 7 || 7), "day");
            } else if (p.weekdayMode === "this") {
                day = day.add(isoDay(p.weekday) - isoDay(day.day()), "day");
            } else {
                day = day.add(ahead === 0 && p.weekdayMode ? 7 : ahead, "day");
            }
        }
    }

    var result;
    var hour = p.hour;
    var minute = p.minute;
    if (hour == null && p.period) {
        hour = PERIOD_HOURS[p.period];
        minute = 0;
    }
    if (hour != null) {
        if (p.meridiem === "pm" && hour < 12) {
            hour += 12;
        } else if (p.meridiem === "am" && hour === 12) {
            hour = 0;
        } else if (!p.meridiem && hour >= 1 && hour < 12) {
            if (p.period && p.period !== "morning" && (p.period !== "night" || hour >= 5)) {
                hour += 12;
            } else if (!p.period && p.guess && hour <= 7) {
                // A bare "at 5" or "quarter past 2" is far more likely the afternoon than the early morning
                hour += 12;
            }
        }
        var total = hour * 60 + minute + (p.minuteDelta || 0);
        var date = day.add(Math.floor(total / 1440), "day").format("iso-short");
        total = ((total % 1440) + 1440) % 1440;
        result = spacetime(`${date}T${pad2(Math.floor(total / 60))}:${pad2(total % 60)}:00`, zone);
    } else if (hasDate) {
        // Only a day was given, so keep the clock time that was already selected
        var clock = clockSource.goto(zone);
        result = spacetime(`${day.format("iso-short")}T${pad2(clock.hour())}:${pad2(clock.minute())}:00`, zone);
    } else {
        result = now;
    }

    for (var span of p.offsets) {
        result = applySpan(result, span);
    }
    return { time: result };
}

function clockText(zoned) {
    var h = zoned.hour();
    var m = zoned.minute();
    return HOUR12 ? `${h % 12 || 12}:${pad2(m)} ${h < 12 ? "AM" : "PM"}` : `${pad2(h)}:${pad2(m)}`;
}

function fullDateText(zoned) {
    return `${zoned.format("day")}, ${zoned.format("month")} ${zoned.date()}, ${zoned.year()} at ${clockText(zoned)}`;
}

// Written so that parseHumanTime reads it back to the same time
function describeTime(t, zone) {
    var zoned = t.goto(zone);
    var today = spacetime.now().goto(zone).startOf("day");
    var days = Math.round((zoned.startOf("day").epoch - today.epoch) / 86400000);
    var label;
    if (days === 0) {
        label = "Today";
    } else if (days === 1) {
        label = "Tomorrow";
    } else if (days === -1) {
        label = "Yesterday";
    } else if (days > 1 && days < 7) {
        label = zoned.format("day");
    } else if (days < -1 && days > -7) {
        label = "Last " + zoned.format("day");
    } else {
        label = `${zoned.format("day")}, ${zoned.format("month")} ${zoned.date()}`;
        // Without a year the parser leans towards the future, so past dates always carry one
        if (zoned.year() !== today.year() || days < 0) label += `, ${zoned.year()}`;
    }
    return `${label} at ${clockText(zoned)}`;
}
