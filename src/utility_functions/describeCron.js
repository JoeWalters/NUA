// Turn a 5-field cron expression into a sentence a human can read, and say
// whether the expression is usable at all.
//
// Scope: exactly what the scheduler UI lets a user type — minute, hour,
// day-of-month, month, day-of-week, each of which may be `*`, a number, a
// range (a-b), a list (a,b,c) and/or a step (*/n or a-b/n). No @macros, no
// seconds field, no names: those never reach the server from this UI, and
// silently accepting them here would mean the preview describes a schedule the
// server rejects.
//
// Returns { valid, description, error }.

const FIELD_NAMES = ['minute', 'hour', 'day of month', 'month', 'day of week'];

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const FIELD_LIMITS = [
    { min: 0, max: 59 },
    { min: 0, max: 23 },
    { min: 1, max: 31 },
    { min: 1, max: 12 },
    { min: 0, max: 7 } // 0 and 7 are both Sunday
];

// Parse one field into { every, values, step, range } or throw a readable error.
function parseField(raw, index) {
    const name = FIELD_NAMES[index];
    const { min, max } = FIELD_LIMITS[index];
    const field = raw.trim();

    if (field === '') throw new Error(`The ${name} field is empty.`);
    if (field === '*') return { every: true, step: 1, values: null };

    const check = (value) => {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
            throw new Error(`${name} value "${value}" is out of range (${min}-${max}).`);
        }
        return parsed;
    };

    // */n and a-b/n: a single step expression, not a list.
    const stepMatch = field.match(/^(\*|(\d+)(?:-(\d+))?)\/(\d+)$/);
    if (stepMatch) {
        const step = Number(stepMatch[4]);
        if (step < 1) throw new Error(`The step in "${field}" must be at least 1.`);
        if (stepMatch[1] === '*') return { every: false, step, values: null, fromStar: true };
        const from = check(stepMatch[2]);
        const to = stepMatch[3] === undefined ? max : check(stepMatch[3]);
        if (from > to) throw new Error(`${name} range "${field}" runs backwards.`);
        return { every: false, step, values: null, range: [from, to] };
    }

    // Comma list, each item a number or a-b range.
    const parts = field.split(',');
    const values = [];
    let explicitRange = null;
    for (const part of parts) {
        const rangeMatch = part.trim().match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const from = check(rangeMatch[1]);
            const to = check(rangeMatch[2]);
            if (from > to) throw new Error(`${name} range "${part}" runs backwards.`);
            if (parts.length === 1) explicitRange = [from, to];
            for (let v = from; v <= to; v++) values.push(v);
        } else {
            values.push(check(part.trim()));
        }
    }
    values.sort((a, b) => a - b);
    return { every: false, step: 1, values, range: explicitRange };
}

function pad(value) {
    return String(value).padStart(2, '0');
}

// "1-5" -> "Mon-Fri", "1,3,5" -> "Mon, Wed and Fri", "0,7" -> "Sunday"
function describeDayOfWeek(field) {
    const values = [...new Set(field.values.map((v) => (v === 7 ? 0 : v)))].sort((a, b) => a - b);
    if (values.length === 7) return null;

    // A contiguous run wrapping from Sunday reads better as a range.
    const isRange = values.length > 2 &&
        values.every((v, i) => i === 0 || v === values[i - 1] + 1);

    if (isRange) return `${DOW_SHORT[values[0]]}-${DOW_SHORT[values[values.length - 1]]}`;
    if (values.length === 1) return `on ${DOW_NAMES[values[0]]}`;
    if (values.length === 2) return `on ${DOW_NAMES[values[0]]} and ${DOW_NAMES[values[1]]}`;
    const head = values.slice(0, -1).map((v) => DOW_SHORT[v]).join(', ');
    return `on ${head} and ${DOW_SHORT[values[values.length - 1]]}`;
}

function describeMonth(field) {
    const values = [...new Set(field.values)];
    if (values.length === 12) return null;
    if (values.length === 1) return ` in ${MONTH_NAMES[values[0] - 1]}`;
    const head = values.slice(0, -1).map((v) => MONTH_NAMES[v - 1]).join(', ');
    return ` in ${head} and ${MONTH_NAMES[values[values.length - 1] - 1]}`;
}

function describeMinute(field) {
    if (field.every) return 'every minute';

    if (field.fromStar) {
        if (field.step === 1) return 'every minute';
        return `every ${field.step} minutes`;
    }

    if (field.range) {
        const [from, to] = field.range;
        if (field.step > 1) return `every ${field.step} minutes from minute ${from} to ${to}`;
        return `every minute from ${from} to ${to}`;
    }

    if (field.values.length === 1) return null; // handled by the time-of-day formatter
    return `at minutes ${field.values.join(', ')}`;
}

function describeHour(field) {
    if (field.every) {
        if (field.fromStar) return field.step === 1 ? 'every hour' : `every ${field.step} hours`;
        return field.range ? `every hour from ${pad(field.range[0])}:00 to ${pad(field.range[1])}:59` : 'every hour';
    }
    if (field.fromStar) {
        return field.step === 1 ? 'every hour' : `every ${field.step} hours`;
    }
    if (field.range) {
        const [from, to] = field.range;
        return field.step > 1
            ? `every ${field.step} hours from ${pad(from)}:00 to ${pad(to)}:59`
            : `every hour from ${pad(from)}:00 to ${pad(to)}:59`;
    }
    if (field.values.length === 1) return null; // a fixed time of day
    return `at ${field.values.map((h) => `${pad(h)}:00`).join(', ')}`;
}

export function describeCron(expression) {
    const text = typeof expression === 'string' ? expression.trim() : '';
    if (!text) {
        return { valid: false, description: '', error: 'Enter a cron expression to see when it runs.' };
    }

    const parts = text.split(/\s+/);
    if (parts.length !== 5) {
        return {
            valid: false,
            description: '',
            error: `A cron expression has 5 fields (minute hour day month weekday); this one has ${parts.length}.`
        };
    }

    let fields;
    try {
        fields = parts.map((part, index) => parseField(part, index));
    } catch (error) {
        return { valid: false, description: '', error: error.message };
    }

    const [minuteField, hourField, domField, monthField, dowField] = fields;

    // "22:00" when both minute and hour name exactly one value.
    let timePart;
    if (minuteField.values && minuteField.values.length === 1 &&
        hourField.values && hourField.values.length === 1) {
        timePart = `at ${pad(hourField.values[0])}:${pad(minuteField.values[0])}`;
    } else {
        const pieces = [describeMinute(minuteField), describeHour(hourField)].filter(Boolean);
        timePart = pieces.join(', ');
    }

    // A minute cadence already repeats every hour: "every 5 minutes, every hour"
    // says the same thing twice.
    if (hourField.every && !hourField.fromStar && !hourField.range) {
        const minuteOnly = describeMinute(minuteField);
        if (minuteOnly) timePart = minuteOnly;
    }

    const dowPart = dowField.every ? null : describeDayOfWeek(dowField);
    const monthPart = monthField.every ? null : describeMonth(monthField);
    const domPart = domField.every ? null : `on day${domField.values.length === 1 ? '' : 's'} ${domField.values.join(', ')}`;

    const clauses = [timePart, domPart, dowPart, (monthPart || '').trim()].filter(Boolean);
    const description = clauses.join(' ').replace(/\s+/g, ' ').trim();

    return {
        valid: true,
        description: description.charAt(0).toUpperCase() + description.slice(1),
        error: null
    };
}
