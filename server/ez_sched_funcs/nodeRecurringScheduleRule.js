const { convertToMilitaryTime } = require("../server_util_funcs/convert_to_military_time");
const { addEasySchedule } = require("./addEasySchedule");
const { jobFunction } = require("../server_util_funcs/jobfunction");
const { dateFromDateString } = require("../server_util_funcs/ez_sched_utils/dateFromDateString");

async function nodeScheduleRecurrenceRule(data, unifi, prisma, jobFunction, schedule) {
    const { date, hour, minute, ampm, modifiedDaysOfTheWeek, deviceId, oneTime, blockAllow, days } = data;
    const deviceToSchedule = await prisma.device.findUnique({ where: { id: deviceId } });


    // const { year, month, day } = dateFromDateString(date);
    const modifiedHour = convertToMilitaryTime(ampm, parseInt(hour));
    const scheduleData = {
        // year,
        // month,
        // day,
        date,
        minute,
        ampm,
        modifiedHour,
        modifiedDaysOfTheWeek,
        oneTime
    }
    console.log('modifiedHour\t', modifiedHour);
    console.log('hour\t', hour, typeof hour);
    console.log('minute\t', minute, typeof minute);
    // const daysToInt = days.split("").map((day) => parseInt(day));
    const rule = new schedule.RecurrenceRule();
    // const dateTime = new Date(year, month-1, day, modifiedHour, parseInt(minute), 0);
    const daysOfTheWeek = modifiedDaysOfTheWeek;
    // rule.dayOfWeek = [...daysToInt];
    rule.dayOfWeek = [...modifiedDaysOfTheWeek];
    // rule.dayOfWeek = [...daysOfTheWeek];
    rule.hour = modifiedHour;
    // rule.hour = hour;
    rule.minute = parseInt(minute);
    const startNewJobTrue = schedule.scheduleJob(rule, () => jobFunction(blockAllow, deviceToSchedule?.macAddress, oneTime, unifi, prisma));
    addEasySchedule(deviceId, blockAllow, scheduleData, startNewJobTrue, prisma);
    return startNewJobTrue;
}

module.exports = { nodeScheduleRecurrenceRule };