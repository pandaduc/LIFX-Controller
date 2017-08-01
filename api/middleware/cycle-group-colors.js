const Promise = require('bluebird')

const dir = require(`${global.baseDir}/global-dirs`)
const logger = require(`${dir.utils}/logger`)

const DURATION = 500
const HUE_INCREMENT = 5 // Has to divide 360 to an integer

const isLightOnline = Boolean
const getLightById = lifxClient => ({ id }) => lifxClient.light(id)

const changeLightPower = powerFuncName => light => (
	Promise.promisify(light[powerFuncName], { context: light })(DURATION)
)

const changeLightColor = (hue, duration = 0) => light => (
	Promise.promisify(light.color, { context: light })(
		hue,
		light.settings.color.saturation,
		light.settings.brightness,
		light.settings.color.kelvin,
		duration
	)
)

const resetLightColor = light => (
	Promise.promisify(light.color, { context: light })(
		0,    // Hue
		100,  // Saturation
		1,    // Brightness
		light.settings.color.kelvin,
		DURATION
	)
)

const turnOffLight = changeLightPower('off')
const turnOnLight = changeLightPower('on')

const changeLightsColor = (hue, duration = 0) => lights => (
	Promise.all(
		lights.map(changeLightColor(hue, duration))
	)
	.then(() => lights)
)

const resetLights = lights => (
	Promise.all(
		lights.map(resetLightColor)
	)
	.then(() => lights)
)

const turnOnLights = lights => (
	Promise.all(
		lights.map(turnOnLight)
	)
	.then(() => lights)
)

const turnOffLights = lights => (
	Promise.all(
		lights.map(turnOffLight)
	)
	.then(() => lights)
)

const cycleLightsColor = (promise, duration = 0, hue = HUE_INCREMENT) => (
	hue % 360 === 0
	? promise
	: (
		cycleLightsColor(
			(
				promise
				.then(changeLightsColor(hue, duration))
				.delay(duration)
			),
			duration,
			hue + HUE_INCREMENT
		)
	)
)

module.exports = (lifxClient, lifxConfig) => (groupName, colorChangeDuration) => {
	logger.log(`Command: Cycle Group Colors => ${groupName} for ${colorChangeDuration}`)

	const group = lifxConfig.groups.get(groupName)

	if (!group) return 'Group does not exist.'

	const lightsInGroup = (
		group.lights
		.map(getLightById(lifxClient))
		.filter(isLightOnline)
	)

	const promise = (
		lifxClient.update(lightsInGroup)
		.then(turnOnLights)
		.delay(DURATION)
		.then(resetLights)
		.delay(DURATION)
	)

	cycleLightsColor(promise, Number(colorChangeDuration))
	.then(resetLights)
	.delay(DURATION)
	.then(turnOffLights)
	.delay(DURATION)
	.then(lifxClient.update)
	.then(() => logger.log('OPERATION COMPLETE'))
	.catch(err => logger.logError(err))
}
