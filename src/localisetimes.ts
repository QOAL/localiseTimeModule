import { tzInfo, defaultTZ } from './tzInfo'

"use strict"

const userSettings = {
	defaults: { ...defaultTZ },
	ignored: [] as Array<string>,
	timeFormat: 0,
	includeClock: true,
	blankSeparator: true,
	avoidMatchingFloatsManually: true,
	enabled: true
}

const shortHandInfo = {"PT": "Pacific Time", "ET": "Eastern Time", "CT": "Central Time", "MT": "Mountain Time"} as Record<string,string>

const fullTitleRegEx = "[a-z \-'áéí–-]{3,45}?(?= time) time"

const tzaolStr = Object.keys(defaultTZ).join("|") + "|" + fullTitleRegEx
const timeRegex = new RegExp('\\b(?:([01]?[0-9]|2[0-3])(:|\\.)?([0-5][0-9])?(:[0-5][0-9])?(?: ?([ap]\\.?m?\\.?))?( ?)(to|until|til|and|or|[-\u2010-\u2015])\\6)?([01]?[0-9]|2[0-3])(:|\\.)?([0-5][0-9])?(:[0-5][0-9])?(?: ?([ap]\\.?m?\\.?)(?= \\w|\\b))?(?:(?: ?(' + tzaolStr + '))(( ?)(?:\\+|-)\\15[0-9]{1,2}(?::?\\d{2})?)?)?\\b', 'giu');

//Match group enumeration
enum _G {
	fullStr = 0,

	startHour,
	startSeparator,
	startMins,
	startSeconds,
	startMeridiem,

	_timeSeparatorSpace,
	timeSeparator,

	hours,
	separator,
	mins,
	seconds,
	meridiem,
	tzAbr,
	offset,
	_offsetWhiteSpace,
}

const whiteSpaceRegEx = /\s/g

const preceedingRegEx = /[-:.,'%\d$£€]/

let dateObj = new Date();

const abbrsThatLookLikeWords = [
	'art', 'bit', 'bot', 'cat', 'cost', 'cot',
	'east', 'eat', 'ect', 'get', 'git', 'mart',
	'met', 'nut', 'pet', 'tot', 'volt', 'west', 'wet',
	'ist', 'kalt', 'gilt', 'mit', 'mut'
]

const oneDayInMS = 86400000

const modes = "tTdDfFR".split('')

interface localisedTimeInfo {
	localisedText: string,
	fullString: string,
	indexInString: number,
	fullStringLength: number
}

type retVal = [
	outputText: string,
	success: boolean
]

function localiseInput(input: string, mode: string = "t", raw: boolean = false): retVal {
	let newText: string

	if (input.trim().length === 0) {
		return ["noInput", false]
	}

	dateObj = new Date()

	//As for handling DST and short codes for time zones
	// I feel like it's best to just call setDSTAmerica() on each call.
	setDSTAmerica()

	if (!modes.includes(mode)) {
		mode = "t"
	}

	const timeInfo = spotTime(input, mode)

	if (timeInfo.length === 0) {
		return ["noTimesDetected", false]
	}

	//Insert any text between the start of the string and the first time occurrence
	newText = input.substr(0, timeInfo[0].indexInString)
	//Go through each time we need to replace
	timeInfo.forEach((thisTime, t) => {
		newText += thisTime.localisedText

		//Do we have any more times to worry about?
		if (timeInfo[t + 1]) {
			//Yes
			//Insert a text node containing all the text between the end of the current time and the start of the next one
			newText += input.substring(thisTime.indexInString + thisTime.fullStringLength, timeInfo[t + 1].indexInString)
		} else {
			//No
			//Fill in the remaining text
			newText += input.substring(thisTime.indexInString + thisTime.fullStringLength)
		}

	})

	//Setting the raw flag will escape the times, so you can copy/paste it.
	if (raw) {
		newText = newText.replace(/<t:/g, "\\<t:")
	}

	return [newText, true]
}

function setDSTAmerica(): void {
	//Work out the DST dates for the USA as part
	// of special casing for DST agnostic PT/ET
	//So first we need to get those dates (We could hard code them)
	const thisYear = new Date().getUTCFullYear()

	const tmpNow = Date.now()

	const offsetInfo = [
		{ hour: 0, short: "ET", standard: "EST", daylight: "EDT" },
		{ hour: 1, short: "CT", standard: "CST", daylight: "CDT" },
		{ hour: 2, short: "MT", standard: "MST", daylight: "MDT" },
		{ hour: 3, short: "PT", standard: "PST", daylight: "PDT" },
	]

	offsetInfo.forEach(info => {
		//Begin DST
		//2nd Sunday in March (2am local, 7am UTC)
		let tmpDate = new Date(Date.UTC(thisYear, 2, 0, 7 + info.hour))
		tmpDate.setUTCMonth(2, (7 - tmpDate.getUTCDay()) + 7)
		const toDST = tmpDate.getTime()

		//End of DST
		//1st Sunday in November (2am local, 6am UTC)
		tmpDate = new Date(Date.UTC(thisYear, 10, 0, 6 + info.hour))
		tmpDate.setUTCMonth(10, 7 - tmpDate.getUTCDay())
		const fromDST = tmpDate.getTime()
		
		const isDaylight = (tmpNow > toDST && tmpNow < fromDST)
		const usedTimeZone =  isDaylight? info.daylight : info.standard
		defaultTZ[info.short] = defaultTZ[usedTimeZone]
	
	})
}

function spotTime(str: string, mode: string = "t"): Array<localisedTimeInfo> {

	const matches = Array.from(str.matchAll(timeRegex))

	const rightNow = Date.now()

	let timeInfo: Array<localisedTimeInfo> = []

	matches.forEach(match => {

		if (!match[_G.tzAbr]) { return }
		let upperTZ: string = match[_G.tzAbr].toUpperCase()

		//If a detected timezone abbreviation includes a space, then we've actually found a full name
		let fullNameOffset: number | undefined
		if (match[_G.tzAbr].indexOf(" ") !== -1) {
			//To check if we've got a valid full name for a timezone,
			// we need to do a little bit of work
			const lcTZAbr = match[_G.tzAbr].toLowerCase()

			//Check if this is a shorthand time zone first
			const shortHandFound = Object.keys(shortHandInfo).find(shK => {
				if (shortHandInfo[shK].toLowerCase() === lcTZAbr) {
					match[_G.tzAbr] = shK;
					upperTZ = shK;
					return true;
				}
			})

			if (!shortHandFound) {
				const longNameInfo = Object.keys(tzInfo).find(tzK => {
					return tzInfo[tzK].find(tzG => {
						if (tzG.title.toLowerCase() === lcTZAbr) {
							fullNameOffset = tzG.offset; 
							return tzG;
						}
					})
				})

				if (longNameInfo && fullNameOffset !== undefined) {
					match[_G.tzAbr] = longNameInfo;
					upperTZ = match[_G.tzAbr].toUpperCase();
				}
			}
		}

		if (!fullNameOffset) {
			if (!validateTime(match, str, upperTZ)) { return }
		}


		let tHour = parseInt(match[_G.hours])
		if (tHour == 0 && !match[_G.mins]) { return } //Bail if the hour is 0 and we have no minutes. (We could assume midnight)
		if (match[_G.meridiem]) {
			tHour = (12 + tHour) % 12
			if (match[_G.meridiem][0].toLowerCase() == 'p') {
				tHour += 12
			}
		} else if (match[_G.startHour] && tHour < 12 && tHour < Number(match[_G.startHour]) && Number(match[_G.startHour]) < 12 && !match[_G.meridiem]) {
			//Non-exhaustive tHour/startHour test - This probably needs fleshing out?
			tHour += 12
		}/* else if (tHour > 0 && tHour < 13 && match[_G.hours].substring(0, 1) !== "0" && !match[_G.meridiem] && !match[_G.mins]) {
			//Skip this time if the hour is 1-12, and it lacks a meridiem and minutes
			// Because it's a vague time.
			return
		}*/
		// I feel like we should handle mixed 12/24 hour times, in time ranges.
		// "7pm - 21:00 UTC" looks really strange, but is currently valid.

		let tMins = match[_G.mins] ? parseInt(match[_G.mins]) : 0
		let tMinsFromMidnight = h2m(tHour, tMins)
		let hourOffset = 0
		//Sometimes people write a tz and then +X (like UTC+1)
		if (match[_G.offset]) {
			let timeOffset = match[_G.offset].replace(whiteSpaceRegEx, '').split(':')
			if (timeOffset.length === 1 && (timeOffset[0].length === 4 || timeOffset[0].length === 5)) {
				timeOffset = [
					timeOffset[0].substring(0, timeOffset[0].length - 2),
					timeOffset[0].substring(timeOffset[0].length - 2)
				]
			}
			hourOffset = parseInt(timeOffset[0]) * 60 + (timeOffset[1] ? parseInt(timeOffset[1]) : 0)
		}
		const mainOffset = (fullNameOffset ?? defaultTZ[upperTZ]) + hourOffset
		let tCorrected = tMinsFromMidnight - mainOffset - dateObj.getTimezoneOffset()

		//Build the localised time
		let timeStamp = buildLocalisedDate(tCorrected, match[_G.seconds])
		let tmpTime = String(timeStamp + (rightNow > timeStamp ? oneDayInMS : 0)).substring(0, 10)
		let localeTimeString = `<t:${tmpTime}:${mode}>`

		let localeStartTimeString = ''

		let validMidnight = true
		//0 is only accepted as a start hour if no meridiems are used, so we're reasonably certain it's a 24hour time.
		if (match[_G.startHour]) {
			if (+match[_G.startHour] === 0) {
				validMidnight = !match[_G.meridiem] && !match[_G.startMeridiem]
			}
		}

		if (match[_G.startHour] && validMidnight) {

			//This is a time range
			//Can we avoid duplicate code?
			let startHour = +match[_G.startHour]

			if (match[_G.startMeridiem]) {
				startHour = (12 + startHour) % 12
				if (match[_G.startMeridiem][0].toLowerCase() == 'p') {
					startHour += 12
				}
			} else if (match[_G.meridiem]) {
				let tmpStartHour = (12 + startHour) % 12
				if (match[_G.meridiem][0].toLowerCase() == 'p') {
					tmpStartHour += 12
				}
				//Make sure we haven't just made the start time later than the end
				if (tmpStartHour < tHour) {
					startHour = tmpStartHour
				}
			}
			//if (startHour > tHour) { console.warn("Invalid time range.", startHour, tHour) }
			let startMins = match[_G.startMins] ? parseInt(match[_G.startMins]) : 0
			let startMinsFromMidnight = h2m(startHour, startMins)

			let startCorrected = startMinsFromMidnight - mainOffset
			startCorrected -= dateObj.getTimezoneOffset()

			//It would be nice to avoid including the meridiem if it's the same as the main time
			let timeSeparator = match[_G.timeSeparator].length === 1 ? "–" : match[_G.timeSeparator]

			//Build the localised time
			timeStamp = buildLocalisedDate(startCorrected, match[_G.startSeconds])
			tmpTime = String(timeStamp + (rightNow > timeStamp ? oneDayInMS : 0)).substring(0, 10)
			localeStartTimeString = `<t:${tmpTime}:${mode}> ${timeSeparator} `
			//Should we capture the user defined separator and reuse it? - Yes, and we are now.
		}

		//Store the localised time, the time that we matched, its offset and length
		timeInfo.push({
			localisedText: String(localeStartTimeString + localeTimeString),
			fullString: match[_G.fullStr],
			indexInString: match.index ?? 0,
			fullStringLength: match[_G.fullStr].length
		})
	})

	return timeInfo
}
function buildLocalisedDate(timeMins: number, seconds:string | false = false) {
	if (timeMins < 0) { timeMins += 1440 }
	const tmpExplode = m2h(timeMins)

	const newDate = new Date(
		dateObj.getUTCFullYear(),
		dateObj.getUTCMonth(),
		dateObj.getUTCDate(),
		tmpExplode[0],
		tmpExplode[1],
		seconds ? Number(seconds.substring(1)) : 0
	)

	return newDate.getTime()
}
function m2h(mins: number): [number, number] {
	mins = Math.abs(mins)
	let h = Math.floor(mins / 60) % 24
	let m = mins % 60
	return [h, m]
}
function h2m(hours: number, mins: number): number {
	return (hours * 60) + mins
}

function validateTime(match: RegExpMatchArray, str: string, upperTZ: string, usingManualTZ: boolean = false): boolean {
	//Check that we have a match, with a valid timezone.
	if (!match[_G.tzAbr] || typeof userSettings.defaults[upperTZ] === "undefined") { return false }

	//Demand the timezone abbreviation be all the same case
	if (!(match[_G.tzAbr] === upperTZ || match[_G.tzAbr] === match[_G.tzAbr].toLowerCase())) { return false }

	//Make sure the user isn't ignoring this abbreviation
	if (userSettings.ignored.indexOf(match[_G.tzAbr].toUpperCase()) !== -1) { return false }

	//blank separator: Require : or . when minutes are given
	if (!match[_G.separator] && match[_G.mins] && !userSettings.blankSeparator) { return false }

	//Minutes are required when a separator is present
	if (match[_G.separator] && !match[_G.mins]) { return false; }

	//We need to change the start of the regex to... maybe (^|\s)
	//The issue here is that : matches the word boundary, and if the input is "30:15 gmt" then it'll match "15 gmt"
	if (match.index && match.index > 0) {
		// Avoid localising this time if the preceding character doesn't look or feel right
		const prevChar = str.substr(match.index - 1, 1)
		if (preceedingRegEx.test(prevChar)) { return false }
	}

	//Avoid matching font sizes
	if (match[_G.tzAbr] === 'pt' && !(match[_G.meridiem] || match[_G.mins])) { return false }

	//Avoid matching estimates that look like years
	if (upperTZ === 'EST' && !(match[_G.meridiem] || match[_G.separator]) && parseInt(match[_G.hours] + match[_G.mins]) > 14) { return false }

	//Avoid matching progressive resolutions
	// Taking care to allow germans to shout, as long as the p is lowercase
	if (match[_G.mins] && !match[_G.separator] && match[_G.meridiem] === 'p' && match[_G.tzAbr] !== 'IST') { return false }

	if (abbrsThatLookLikeWords.includes(match[_G.tzAbr])) {
		//Avoid cat and eat false positives
		// Require either the meridiem or minutes & separator
		if (!(match[_G.meridiem] || (match[_G.mins] && match[_G.separator]))) {
			return false
		}
		//Avoid falsely matching "3 a bit"
		// Require either the meridiem or minutes & separator
		if (match[_G.meridiem] === 'a' && !(match[_G.mins] && match[_G.separator])) {
			return false
		}
	}

	if (usingManualTZ) {
		//Manually converted times will easily match numbers without this
		if (!(match[_G.separator] || match[_G.meridiem])) { return false }

		//avoidMatchingFloatsManually: If we're manually converting times,
		// ignore full stops used as time separators, with no meridiems (Can help avoid matching with numbers)
		if (match[_G.separator] === "." && match[_G.mins] && !match[_G.meridiem] && userSettings.avoidMatchingFloatsManually) { return false }
	}

	return true
}

export { localiseInput }
