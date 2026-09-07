'use strict';

const ecovacsApi = require('../../lib/ecovacsApi');
const CONSTANTS = require('../../lib/constants.js');
const { Device } = require('homey');

const https = require('https');
const crypto = require('crypto');

// const tools = require('../../lib/tools');
// const { PassThrough } = require('stream');
// const crypto = require("crypto");
// const SYNC_INTERVAL = 1000 * 30;  // 5 seconds

class VacuumDevice extends Device {

	async onInit() {

		this.log('Device ' + this.getName() + ' has been initialized');

		await this._updateCapabilities();
		await this.setAvailable();	

		this.registerCapabilityListener('clean', this.onCapabilityClean.bind(this));
		this.registerCapabilityListener('pause', this.onCapabilityPause.bind(this));
		this.registerCapabilityListener('stop', this.onCapabilityStop.bind(this));
		this.registerCapabilityListener('charge', this.onCapabilityCharge.bind(this));
		this.registerCapabilityListener('wash_mop', this.onCapabilityWashMop.bind(this));
		this.registerCapabilityListener('dry_mop', this.onCapabilityDryMop.bind(this));
		this.registerCapabilityListener('empty_dustbin', this.onCapabilityEmptyDustbin.bind(this));
		this.registerCapabilityListener('park', this.onCapabilityPark.bind(this));
		this.registerCapabilityListener('park_position', this.onCapabilityParkPosition.bind(this));
		this.registerCapabilityListener('suction_power', this.onCapabilitySuctionPower.bind(this));
		this.registerCapabilityListener('water_flow_level', this.onCapabilityWaterFlowLevel.bind(this));
		this.registerCapabilityListener('water_flow_value', this.onCapabilityWaterFlowValue.bind(this));
		this.registerCapabilityListener('work_mode', this.onCapabilityWorkMode.bind(this));
		this.registerCapabilityListener('sweep_mode', this.onCapabilitySweepMode.bind(this));
		this.registerCapabilityListener('clean_count_mode', this.onCapabilityCleanCountMode.bind(this));

		try{
			// Init API and connect
			await this.initApi();
		}
		catch(error){
			this.error('Error: error.message ', error);
			await this.setUnavailable(error.message).catch(this.error);
		}
	}

	// =======================================================================================================================================================================================
	// DEVICE
	// =======================================================================================================================================================================================	
	async _updateCapabilities(){
		let capabilities = [];
		try{
		capabilities = this.homey.app.manifest.drivers.filter((e) => {return (e.id == this.driver.id);})[0].capabilities;
		// remove capabilities
		let deviceCapabilities = this.getCapabilities();
		for (let i=0; i<deviceCapabilities.length; i++){
			let filter = capabilities.filter((e) => {return (e == deviceCapabilities[i]);});
			if (filter.length == 0 ){
			try{
				await this.removeCapability(deviceCapabilities[i]);
			}
			catch(error){}
			}
		}
		// add missing capabilities
		for (let i=0; i<capabilities.length; i++){
			if (!this.hasCapability(capabilities[i])){
			try{
				await this.addCapability(capabilities[i]);
			}
			catch(error){}
			}
		}
		}
		catch (error){
		this.error(error.message);
		}
	}

  	async ready() {
		this.log('Device ' + this.getName() + ' :ready');
	}

	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log('Device ' + this.getName() + ' settings changed', oldSettings, newSettings, changedKeys);
	}

	async onRenamed(name) {
		this.log('Device was renamed to' + this.getName());
	}

	async onDeleted() {
		this.log('Device ' + this.getName() + 'has been deleted');
		this.vacbot.disconnect();
	}

	// =======================================================================================================================================================================================
	// API
	// =======================================================================================================================================================================================	

	async initApi() {
		this.log('Vacuum has been added');

		// let data = this.getData();
		this.log('Device ID: ' + this.getStoreValue('deviceId') + ' email: ' + this.getStoreValue('email'));

		try{
			this.api = await ecovacsApi.getApi(this.getStoreValue('deviceId'));

			// Variant using the auth token to login
			// store auth token if changed
			this.api.on('credentialsUpdated', (data) => { 
				this.log('credentialsUpdated'); 
				this.setStoreValue('api', this.api);
			});
			// try to use auth token. 
			try{
				this.log('setCredentials (token)');
				const api = this.getStoreValue('api');
				await this.api.setCredentials({
					"email": this.getStoreValue('email'),
					"uid": 	api.uid,
					"user_access_token": api.user_access_token,
					"tokenExpiresAt": api.tokenExpiresAt
				});
			}
			catch(error){
				this.log('credentials not valid, connect with user/password');
				await this.api.connect( this.getStoreValue('email'), ecovacsApi.getPasswordHash(this.getStoreValue('password')) );
			}

			// Variant using the user/password
			// await this.api.connect( this.getStoreValue('email'), ecovacsApi.getPasswordHash(this.getStoreValue('password')) );
			
			// Enable auto refrsh for both variante
			this.api.enableAutoTokenRefresh(this.getStoreValue('email'),  ecovacsApi.getPasswordHash(this.getStoreValue('password')));
		}
		catch(error){
			if (error.name === 'DeviceVerificationRequired') {
				throw new Error('Device verification required. Repair device and log in again including 2FA verification code.');
			}
			else{
				throw error;
			}
		}

		await this.setStoreValue('areas', []).catch((error) => { this.error('Error: ' + error); });
		await this.setStoreValue('mapnames', []).catch((error) => { this.error('Error: ' + error); });

		this.log('Deebot ApiVersion : ', this.api.getVersion());
		this.vacbot = this.api.getVacBot(this.api.uid, ecovacsApi.getConstant('REALM'), this.api.resource, this.api.user_access_token, this.getStoreValue('vacuum'), this.getStoreValue('geo'));

		this.vacbot.on('ready', async (event) => {

			this.log('Model information');
			this.log('- Name: ' + this.vacbot.getName());
			this.log('- Model: ' + this.vacbot.deviceModel);
			this.log('- DeviceClass: ' + this.vacbot.deviceClass);
			this.log('- Image url: ' + this.vacbot.deviceImageURL);
			this.log('- Is fully supported model: ' + this.vacbot.isSupportedDevice());
			this.log('- Is a at least partly supported model: ' + this.vacbot.isKnownDevice());
			this.log('- Is legacy model: ' + this.vacbot.isLegacyModel());
			this.log('- Is 950 type model: ' + this.vacbot.is950type());
			this.log('- V2 commands are implemented: ' + this.vacbot.is950type_V2());
			this.log('- Communication protocol: ' + this.vacbot.getProtocol());
			this.log('- Main brush: ' + this.vacbot.hasMainBrush());
			this.log('- Mapping capabilities: ' + this.vacbot.hasMappingCapabilities());
			this.log('- Edge cleaning mode: ' + this.vacbot.hasEdgeCleaningMode());
			this.log('- Spot cleaning mode: ' + this.vacbot.hasSpotCleaningMode());
			this.log('- Spot area cleaning mode: ' + this.vacbot.hasSpotAreaCleaningMode());
			this.log('- Custom area cleaning mode: ' + this.vacbot.hasCustomAreaCleaningMode());
			this.log('- Mopping system: ' + this.vacbot.hasMoppingSystem());
			this.log('- Voice reports: ' + this.vacbot.hasVoiceReports());
			this.log('- Auto empty station: ' + this.vacbot.hasAutoEmptyStation());
			this.log('- Canvas module available: ' + this.api.getCanvasModuleIsAvailable());
			this.log('- Using country: ' + this.api.getCountryName());
			this.log('- Using continent code: ' + this.api.getContinent());
			this.log('ApiVersion : ' + this.api.getVersion());
			this.log('Device is ready');

			this.vacbot.on('WorkMode', (workMode) =>  this.onWorkMode(workMode));
			this.vacbot.on('SweepMode', (mode) => this.onSweepMode(mode));
			this.vacbot.on('WorkState', (workState) => this.onWorkState(workState));
			this.vacbot.on('CleanCount', (cleanCount) => this.onCleanCount(cleanCount));
			// this.vacbot.on('BatteryLevel', (batteryLevel) => {
			// 	if (appdebug) { this.log('vacbot.on(BatteryLevel, ' + JSON.stringify(batteryLevel) + ')'); }
			// });
			this.vacbot.on('BatteryInfo', (battery) => this.onBatteryInfo(battery));
			this.vacbot.on('ChargeState', (state) => this.onChargeState(state));
			this.vacbot.on('DeebotPosition', (values) => this.onDebotPosition(position));
			this.vacbot.on('CleanSpeed', (level) => this.onCleanSpeed(level));
			this.vacbot.on('WaterLevel', (level) => this.onWaterLevel(level));
			this.vacbot.on('WaterInfo', (level) => this.onWaterInfo(level));

			this.vacbot.on('Maps', async (maps) => await this.onMaps(maps));
			this.vacbot.on('MapSpotAreas', async (areas) => await this.onMapSpotAreas(areas));
			this.vacbot.on('MapSpotAreaInfo', async (area) => await this.onMapSpotAreaInfo(area));
			this.vacbot.on('MapSet_V2', async (mapset) => await this.onMapSet(mapset));
			this.vacbot.on('ErrorCode', async (errorcode) => await this.onErrorCode(errorcode));
			this.vacbot.on('ErrorCode', async (error) => await this.onError(error));

			this.vacbot.on('WaterBoxScrubbingType', async (mode) => { this.log('WaterBoxScrubbingType: ' + mode); });
			this.vacbot.on('MoppingSystemInfo ', async (state) => this.log('MoppingSystemInfo: ' + state));

			this.vacbot.on('CleanReport', (cleanReport) => this.onCleanReport(cleanReport));
			this.vacbot.on('CleanLog', (cleanLog) => this.onCleanLog(cleanLog));
			this.vacbot.on('LastCleanLogs', (lastCleanLogs) => this.onLastCleanLogs(lastCleanLogs));
			this.vacbot.on('CurrentStats', (currentStats) => this.onCurrentStats(currentStats));
			// this.vacbot.on('onWorkProgressReport ', async (state) => this.log('onWorkProgressReport: ' + state)); // currently not supported, example: { clean: 24, dry: 0, wash: 0 }
			this.vacbot.on('TaskStarted', async (data) =>  { 
				this.log('TaskStarted: ' + data); });

			

			this.vacbot.on('MapImage ', async (mapImage) => 
				this.onMapImage(mapImage));
			this.vacbot.on('MapImageData', async (mapImage) =>  { 
				this.log('MapImageData: ' + mapImage); });
			this.vacbot.on('MapDataReady', async (mapImage) =>  { 
				this.log('MapDataReady: ' + mapImage); });
			this.vacbot.on('MapDataObject', async (mapImage) =>  { 
				this.log('MapDataObject: ' + mapImage); });
			this.vacbot.on('MapInfo', async (mapInfo) =>  { 
				this.log('MapInfo: ' + mapInfo); });
			this.vacbot.on('MinorMap', async (mapInfo) =>  { 
				this.log('MinorMap: ' + mapInfo); });

			// Update states
			if (appdebug) { this.log('vacbot.run(GetWaterBoxInfo)'); } this.vacbot.run('GetWaterBoxInfo');
			if (appdebug) { this.log('vacbot.run(GetCleanCount)'); } this.vacbot.run('GetCleanCount');
			if (appdebug) { this.log('vacbot.run(GetCleanSpeed)'); } this.vacbot.run('GetCleanSpeed');
			if (appdebug) { this.log('vacbot.run(GetWaterLevel)'); } this.vacbot.run('GetWaterLevel');
			if (appdebug) { this.log('vacbot.run(GetWaterInfo)'); } this.vacbot.run('GetWaterInfo');
			if (appdebug) { this.log('vacbot.run(GetAutoEmpty)'); } this.vacbot.run('GetAutoEmpty');
			if (appdebug) { this.log('vacbot.run(GetBatteryState)'); } this.vacbot.run('GetBatteryState');
			if (appdebug) { this.log('vacbot.run(GetCleanState)'); } this.vacbot.run('GetCleanState');
			if (appdebug) { this.log('vacbot.run(GetPosition)'); } this.vacbot.run('GetPosition');
			if (appdebug) { this.log('vacbot.run(GetStats)'); } this.vacbot.run('GetStats');
			if (appdebug) { this.log('vacbot.run(GetWorkState)'); } this.vacbot.run('GetWorkState');
			if (appdebug) { this.log('vacbot.run(GetChargeState)'); } this.vacbot.run('GetChargeState');
			if (appdebug) { this.log('vacbot.run(GetWorkMode)'); } this.vacbot.run('GetWorkMode');
			if (appdebug) { this.log('vacbot.run(GetSweepMode)'); } this.vacbot.run('GetSweepMode');
			if (appdebug) { this.log('vacbot.run(GetMaps)'); } this._getMaps();
			// if (appdebug) { this.log('vacbot.run(GetCleanReport)'); } this.vacbot.run('GetCleanReport');

			// this.vacbot.run("GetMapImage", 1132941211, "outline");

			// this.vacbot.on('CleanLog', async (object) => {
			// 	if (appdebug) { this.log('vacbot.on(CleanLog, ' + object + ')'); }
			// 	if (object.length === 0) { return; }
			// 	var stopReason = -1;
			// 	try {
			// 		switch ((object[0].stopReason - 1).toString()) {
			// 			case '0': stopReason = 'CLEAN_SUCCESSFUL'; break;
			// 			case '1': stopReason = 'STOPPED_BY_APP'; break;
			// 			case '2': stopReason = 'BATTERY_LOW'; break;
			// 			case '3': stopReason = 'STOPPED_BY_IR'; break;
			// 			case '4': stopReason = 'STOPPED_BY_BUTTON'; break;
			// 			case '5': stopReason = 'STOPPED_BY_WARNING'; break;
			// 			case '6': stopReason = 'STOPPED_BY_NO_DISTURB'; break;
			// 			case '7': stopReason = 'STOPPED_BY_CLEARMAP'; break;
			// 			case '8': stopReason = 'STOPPED_BY_NO_PATH'; break;
			// 			case '9': stopReason = 'STOPPED_BY_NOT_IN_MAP'; break;
			// 			case '10': stopReason = 'STOPPED_BY_VIRTUAL_WALL'; break;
			// 			case '11': stopReason = 'WIRE_CHARGING'; break;
			// 			case '12': stopReason = 'STOPPED_BY_AIR_SPOT'; break;
			// 			case '13': stopReason = 'STOPPED_BY_AIR_AUTO'; break;
			// 			default: stopReason = 'UNKNOWN (' + object[0].stopReason + ')';
			// 		}
			// 	}



		});

		this.vacbot.connect();
	}

	// =======================================================================================================================================================================================
	// EVENTS
	// =======================================================================================================================================================================================	

	onWorkMode(workMode){
		if (appdebug) { this.log('vacbot.on(WorkMode, ' + JSON.stringify(workMode) + ')'); }
		// 'vacuumAndMop': 0,  // Vacuum and mop
		// 'vacuum': 1,        // Vacuum only
		// 'mop': 2,           // Mop only
		// 'mopAfterVacuum': 3 // Mop after vacuum
		this.setCapabilityValue('work_mode', workMode.toString()).catch((error) => { this.log('Error: ' + error); });
		this.setCapabilityValue('work_mode.display', workMode.toString()).catch((error) => { this.log('Error: ' + error); });
	}

	onWorkState(workState){
		if (appdebug) { this.log('vacbot.on(WorkState, ' + JSON.stringify(workState) + ')'); }

		let lastRobotState = this.getCapabilityValue('state_device');

		switch (workState.robot) {
			case CONSTANTS.WORKMODE_ROBOT_CLEANING: 
				this.setCapabilityValue('clean', true).catch((error) => { this.log('Error: ' + error); }); 
				break;
			case CONSTANTS.WORKMODE_ROBOT_IDLE:
				this.setCapabilityValue('clean', false).catch((error) => { this.log('Error: ' + error); }); 
				break;

		}
		if (workState.paused != undefined) {
			this.setCapabilityValue('pause', workState.paused).catch((error) => { this.log('Error: ' + error); }); 
		}
		this.setCapabilityValue('state_device', workState.robot).catch((error) => { this.log('Error: ' + error); });
		this.setCapabilityValue('state_station', workState.station).catch((error) => { this.log('Error: ' + error); });

		// set buttons state
		if (workState.station == CONSTANTS.WORKMODE_STATION_GOWASHING || workState.station == CONSTANTS.WORKMODE_STATION_WASHING) {
			this.setCapabilityValue('wash_mop', true).catch((error) => { this.log('Error: ' + error); });
		}
		else{
			this.setCapabilityValue('wash_mop', false).catch((error) => { this.log('Error: ' + error); });
		}
		if (workState.station == CONSTANTS.WORKMODE_STATION_DRYING) {
			this.setCapabilityValue('dry_mop', true).catch((error) => { this.log('Error: ' + error); });
		}
		else{
			this.setCapabilityValue('dry_mop', false).catch((error) => { this.log('Error: ' + error); });
		}

		// get clean log
		if (lastRobotState != CONSTANTS.WORKMODE_ROBOT_IDLE &&
			workState.robot == CONSTANTS.WORKMODE_ROBOT_IDLE ) {
			this.vacbot.run('GetCleanLogs');
		}

	}


	onCleanCount(cleanCount){
		if (appdebug) { this.log('vacbot.on(CleanCount, ' + JSON.stringify(cleanCount) + ')'); }
		this.setCapabilityValue('clean_count_mode', cleanCount.toString()).catch((error) => { this.error('Error: ' + error); });
		this.setCapabilityValue('clean_count_mode.display', cleanCount.toString()).catch((error) => { this.error('Error: ' + error); });
	}

	onDebotPosition(position){
		if (appdebug) { this.log('vacbot.on(DeebotPosition, ' + JSON.stringify(position) + ')'); }
		this.setStoreValue('currentPosition', position).catch((error) => { this.log('Error: ' + error); });
	}

	onBatteryInfo(battery){
		if (appdebug) { this.log('vacbot.on(BatteryInfo, ' + JSON.stringify(battery) + ')'); }
		this.setCapabilityValue('measure_battery', Math.round(battery)).catch((error) => { this.log('Error: ' + error); });
	}

	onChargeState(state){
		if (appdebug) { this.log('vacbot.on(ChargeState, ' + JSON.stringify(state) + ')'); }

		// let lastChargeState = this.getCapabilityValue('state_charge');

		this.setCapabilityValue('state_charge', state).catch((error) => { this.log('Error: ' + error); });

		// clean log request now done for robot state (WorkState)
		// // work done (charge state idle => charging)
		// if (lastChargeState == CONSTANTS.CHARGE_STATE_IDLE &&
		// 	state == CONSTANTS.CHARGE_STATE_CHARGING ) {
		// 	this.vacbot.run('GetCleanLogs');
		// }
	}

	onCleanSpeed(level){
		if (appdebug) { this.log('vacbot.on(CleanSpeed, ' + level.toString() + ')'); }
		this.setCapabilityValue('suction_power', level.toString()).catch((error) => { this.error('Error: ' + error); });
		this.setCapabilityValue('suction_power.display', level.toString()).catch((error) => { this.error('Error: ' + error); });
	}

	onWaterLevel(level){
		if (appdebug) { this.log('vacbot.on(WaterLevel, ' + level.toString() + ')'); }
		if (level == undefined) {
			return;
		}

		this.setCapabilityValue('water_flow_level', level).catch((error) => { this.error('Error: ' + error); });
		this.setCapabilityValue('water_flow_level.display', level).catch((error) => { this.error('Error: ' + error); });
		// map to int value
		switch (level) {
			case 1:
			case '1':
				this.setCapabilityValue('water_flow_value', 20).catch((error) => { this.error('Error: ' + error); });
				break;
			case 2:
			case '2':
				this.setCapabilityValue('water_flow_value', 30).catch((error) => { this.error('Error: ' + error); });
				break;
			case 3:
			case '3':
				this.setCapabilityValue('water_flow_value', 40).catch((error) => { this.error('Error: ' + error); });
				break;
			case 4:
			case '4':
				this.setCapabilityValue('water_flow_value', 50).catch((error) => { this.error('Error: ' + error); });
				break;
		}
	}

	onWaterInfo(level){
		if (appdebug) { this.log('vacbot.on(WaterInfo, ' + JSON.stringify(level) +  ')'); }
		if (level == undefined) {
			return;
		}

		if (level.customAmount == undefined) {
			return;
		}
		this.setCapabilityValue('water_flow_value', level.customAmount).catch((error) => { this.error('Error: ' + error); });
		// map to enum value
		if (level.customAmount <= 20) {
			this.setCapabilityValue('water_flow_level', '1' ).catch((error) => { this.error('Error: ' + error); });
			this.setCapabilityValue('water_flow_level.display', '1' ).catch((error) => { this.error('Error: ' + error); });
		}
		else if (level.customAmount <= 30) {
			this.setCapabilityValue('water_flow_level', '2' ).catch((error) => { this.error('Error: ' + error); });
			this.setCapabilityValue('water_flow_level.display', '2' ).catch((error) => { this.error('Error: ' + error); });
		}
		else if (level.customAmount <= 40) {
			this.setCapabilityValue('water_flow_level', '3' ).catch((error) => { this.error('Error: ' + error); });
			this.setCapabilityValue('water_flow_level.display', '3' ).catch((error) => { this.error('Error: ' + error); });
		}
		else {
			this.setCapabilityValue('water_flow_level', '4' ).catch((error) => { this.error('Error: ' + error); });
			this.setCapabilityValue('water_flow_level.display', '4' ).catch((error) => { this.error('Error: ' + error); });
		}
	}

	onSweepMode(mode){
		if (appdebug) { this.log('vacbot.on(SweepMode, ' + JSON.stringify(mode) + ')'); }
		this.setCapabilityValue('sweep_mode', mode.toString()).catch((error) => { this.error('Error: ' + error); });
		this.setCapabilityValue('sweep_mode.display', mode.toString()).catch((error) => { this.error('Error: ' + error); });
		// 0=Standard, 1=Tief, 2=Effizient
	}

	onCleanLog(cleanLog){
		// if (appdebug) { this.log('vacbot.on(CleanLog, ' + JSON.stringify(cleanLog) + ')'); }
		if (appdebug) { this.log('vacbot.on(CleanLog Newest CleanLog: ' + JSON.stringify(cleanLog[0]) + ')'); }
		if (cleanLog == undefined || cleanLog[0] == undefined) {
			return;
		}

		let tz  = this.homey.clock.getTimezone();
		let cleanTimestamp = cleanLog[0].timestamp == undefined? new Date(now) : new Date(cleanLog[0].timestamp*1000);
		let time = cleanTimestamp.toLocaleString(this.homey.i18n.getLanguage(), 
            { 
                hour12: false, 
                timeZone: tz,
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            });
        let timestamp = time.replace(',', '');

		const cleanLogTrigger = this.homey.flow.getDeviceTriggerCard('clean_log');
      	cleanLogTrigger.trigger(this, {
			timestamp: timestamp,
			square_meters: cleanLog[0].squareMeters,
			totel_time: cleanLog[0].totalTimeFormatted
		}, null).catch((error) => { this.log('Error: ' + error)});
	}

	async onLastCleanLogs(lastCleanLogs){
		if (appdebug) { this.log('vacbot.on(LastCleanLogs, ' + JSON.stringify(lastCleanLogs) + ')'); }
	}
	
	// Not emitted for V2
	// onCleanReport(cleanReport){
	// 	if (appdebug) { this.log('vacbot.on(CleanReport, ' + JSON.stringify(cleanReport) + ')'); }
	// 	if (cleanReport != this.getStoreValue('lastCleanReport')
	// 		|| 
	// 		cleanReport == CONSTANTS.WORKMODE_ROBOT_IDLE)  {
	// 		this.vacbot.run('GetCleanLogs');
	// 		this.setStoreValue('lastCleanReport', cleanReport).catch((error) => { this.error('Error: ' + error); });
	// 	}
	// }

	onCurrentStats(currentStats){
		if (appdebug) { this.log('vacbot.on(CurrentStats, ' + JSON.stringify(currentStats) + ')'); }
	}

	onMaps(maps){
		if (appdebug) { this.log('vacbot.on(Maps, ' + JSON.stringify(maps) + ')'); }

		let mapnames = [];
		for (const map of maps['maps']) {
			const mapID = map['mapID'];
			const mapIndex = map['mapIndex'];
			mapnames.push(
				{
					'mapid': mapID,
					'mapIndex': map['mapIndex'],
					'name': map['mapName'],
					'mapStatus': map['mapStatus'],
					'mapIsCurrentMap': map['mapIsCurrentMap']
				}
			);
			if (map['mapIsCurrentMap']) {
				this.setStoreValue('currentMap', { 'mapID': mapID, 'MapIndex': mapIndex }).catch((error) => { this.error('Error: ' + error); });
			}

			this.setStoreValue('maps', mapnames).catch((error) => { this.error('Error: ' + error); });
			if (appdebug) { this.log('Maps: ', JSON.stringify(mapnames)); }

			this.log('-Updating Floor ' + map['mapName']);

			// // Only V1
			// this.vacbot.run('GetSpotAreas', mapID);
			// V2 alternative (GetMapSet => GetMapSet_V2)
			this.vacbot.run('GetMapSet', mapID, 'ar')

		}

	}

	// Only V1
	onMapSpotAreas(areas){
		try{
			if (appdebug) { this.log('vacbot.on(MapSpotAreas, ' + JSON.stringify(areas) + ')'); }

			for (const spotArea of areas?.mapSpotAreas ?? []) {
				const spotAreaID = spotArea['mapSpotAreaID'];
				this.vacbot.run('GetSpotAreaInfo', areas['mapID'], spotAreaID);
			}			
		}
		catch (error) {
			this.log('Error: ' + error.message);
			throw new Error(error.message + ' (onMapSpotAreas): ' + JSON.stringify(areas));
		}
	}

	// Only V1
	onMapSpotAreaInfo(area){
		try {
			if (appdebug) { this.log('vacbot.on(MapSpotAreaInfo, ' + JSON.stringify(area) + ')'); }

			if (!area) {
				return;
			}
			let tableAreas = this.getStoreValue('areas') ?? [];
			tableAreas = tableAreas.filter(
				item =>
					item.mapid !== area.mapID ||
					item.zoneid !== area.mapSpotAreaID
			);

			tableAreas.push({
				mapid: area.mapID,
				name: area.mapSpotAreaName,
				zoneid: area.mapSpotAreaID,
				// toto: area.mapSpotAreaBoundaries,
				// boundaries: this.convertBoundaries(area.mapSpotAreaBoundaries),
			});

			this.setStoreValue('areas', tableAreas).catch((error) => { this.error('Error: ' + error); });
			// await this.createToken(area.mapID, area.mapSpotAreaID, area.mapSpotAreaName).then(() => { this.log('--Updated Zone ' + area.mapSpotAreaName); });
			
			if (appdebug) { this.log(JSON.stringify(tableAreas)); }
		}
		catch (error) {
			this.log('Error: ' + error.message);
			throw new Error(error.message + ' (onMapSpotAreaInfo): ' + JSON.stringify(mapSpotAreaInfo));
		}
	}

	onMapSet(mapset){
		if (appdebug) { this.log('vacbot.on(MapSet_V2, ' + JSON.stringify(mapset) + ')'); }

		if (mapset == undefined || mapset['subsets'] == undefined) {
			return;
		}

		let areas = this.getStoreValue('areas');
		areas = areas.filter(item => item.mapid !== mapset.mid);

		for (const subset of mapset['subsets']) {
			areas.push(
				{
					mapid: mapset.mid,
					name: subset.name,
					zoneid: subset.mssid,
					id: mapset.mid + subset.mssid,
					spotPosition: subset.spotPosition // Format "-3425,975"
					// toto: area.mapSpotAreaBoundaries,
					// boundaries: this.convertBoundaries(area.mapSpotAreaBoundaries),
				}
			);
			this.setStoreValue('areas', areas).catch((error) => { this.error('Error: ' + error); });
		}
		if (appdebug) { this.log(JSON.stringify(areas)); }
		// var areasPrint = areas;
		// areasPrint.forEach(area => delete area.toto);
		// areasPrint.forEach(area => delete area.boundaries);
		// if (appdebug) { this.log(JSON.stringify(areasPrint)); }

	}

	onMapImage(mapImage){
		if (appdebug) { this.log('vacbot.on(MapImage, ' + JSON.stringify(mapImage) + ')'); }

	}

	async onErrorCode(errorcode) {
		if (parseInt(errorcode) !== 0 && parseInt(errorcode) !== 100) {
			var error = JSON.stringify(this.homey.__("Deebot.Error" + errorcode));
			this.error('Deebot Error: ', error + " (errorcode " + errorcode + ")");
			// this.homey.flow.getDeviceTriggerCard('error').trigger(this, { error: error, errorcode: parseInt(errorcode) });

			// await errorReportTrigger.trigger(this, { error: error, errorcode: parseInt(errorcode) });
		}		
	}

	async onError(error) {
		this.log('Deebot Error: ', error);
	}


	// =======================================================================================================================================================================================
	// CAPABILITIES
	// =======================================================================================================================================================================================	

	async onCapabilityClean(value, opts) {
		if (appdebug) { this.log('onCapabilityClean(' + value + ')'); }
		if (value) {
			this.setCapabilityValue('pause', false).catch((error) => { this.log('Error: ' + error); });
			// this.setCapabilityValue('clean', true).catch((error) => { this.log('Error: ' + error); });
			this.vacbot.run('Clean');
		}
		else{
			this.setCapabilityValue('pause', false).catch((error) => { this.log('Error: ' + error); });
			this.vacbot.run('Stop');
		}
	}

	async onCapabilityPause(value, opts) {
		if (appdebug) { this.log('onCapabilityPause(' + value + ')'); }
		if (value) {
			this.setCapabilityValue('pause', true).catch((error) => { this.log('Error: ' + error); });
			this.vacbot.run('Pause');
		} else {
			this.setCapabilityValue('pause', false).catch((error) => { this.log('Error: ' + error); });
			this.vacbot.run('Resume');
		}
	}

	async onCapabilityStop(value, opts) {
		if (appdebug) { this.log('onCapabilityStop(' + value + ')'); }
		if (value) {
			this.setCapabilityValue('clean', false).catch((error) => { this.log('Error: ' + error); });
			this.setCapabilityValue('pause', false).catch((error) => { this.log('Error: ' + error); });
			this.vacbot.run('Stop');
		}
	}

	async onCapabilityCharge(value, opts) {
		if (appdebug) { this.log('onCapabilityCharge(' + value + ')'); }
		if (value) {
			this.setCapabilityValue('clean', false).catch((error) => { this.log('Error: ' + error); });
			this.setCapabilityValue('pause', false).catch((error) => { this.log('Error: ' + error); });
			this.vacbot.run('Charge');
		}
	}

	async onCapabilityWashMop(value, opts) {
		if (appdebug) { this.log('onCapabilityWashMop(' + value + ')'); }
		if (value) {
			this.vacbot.run('WashingStart');
		}
		else{
			this.vacbot.run('WashingStop');
		}
	}

	async onCapabilityDryMop(value, opts) {
		if (appdebug) { this.log('onCapabilityDryMop(' + value + ')'); }
		if (value) {
			this.vacbot.run('AirDryingStart');
		}
		else{
			this.vacbot.run('AirDryingStop');
		}
	}

	async onCapabilityEmptyDustbin(value, opts) {
		if (appdebug) { this.log('onCapabilityEmptyDustbin(' + value + ')'); }
		if (value) {
			this.vacbot.run('EmptyDustbin');
		}
	}

	async onCapabilityPark(value, opts) {
		if (appdebug) { this.log('onCapabilityPark(' + value + ')'); }
		await this._park();
	}

	async onCapabilityParkPosition(value, opts) {
		if (appdebug) { this.log('onCapabilityParkPosition(' + value + ')'); }
		try {
			let position = await this.vacbot.runAsync('GetPosition');
			if (position != undefined) {
				await this.setStoreValue('parkPosition', position.deebotPos);				
			}
		}
		catch (error) {
			if (appdebug) { this.log('onCapabilityParkPosition error (' + error + ')'); }
			throw error;
		}
	}

	async onCapabilitySuctionPower(value, opts) {
		if (appdebug) { this.log('onCapabilitySuctionPower(' + value + ')'); }
		this.vacbot.run('SetCleanSpeed', value);
	}

	async onCapabilityWaterFlowLevel(value, opts) {
		if (appdebug) { this.log('onCapabilityWaterFlow(' + value + ')'); }
		this.vacbot.run('SetWaterLevel', value);		

		switch (value){
			case 1:
			case '1':
				this.vacbot.run('SetWaterInfo', null, 20, null);
				break;
			case 2:
			case '2':
				this.vacbot.run('SetWaterInfo', null, 30, null);
				break;
			case 3:
			case '3':
				this.vacbot.run('SetWaterInfo', null, 40, null);
				break;
			case 4:
			case '4':
				this.vacbot.run('SetWaterInfo', null, 50, null);
				break;
		}
	}

	async onCapabilityWaterFlowValue(value, opts) {
		if (appdebug) { this.log('onCapabilityWaterFlow(' + value + ')'); }
		this.vacbot.run('SetWaterInfo', null, value, null);

		if (value <= 20) {
			this.vacbot.run('SetWaterLevel', 1);					
		}
		else if (value <= 30) {
			this.vacbot.run('SetWaterLevel', 2);					
		}
		else if (value <= 40) {
			this.vacbot.run('SetWaterLevel', 3);					
		}
		else  {
			this.vacbot.run('SetWaterLevel', 4);					
		}
	}

	async onCapabilityWorkMode(value, opts) {
		if (appdebug) { this.log('onCapabilityWorkMode(' + value + ')'); }
		this.vacbot.run('SetWorkMode', Number(value));
	}

	async onCapabilitySweepMode(value, opts) {
		if (appdebug) { this.log('onCapabilitySweepMode(' + value + ')'); }
		this.vacbot.run('SetSweepMode', Number(value));
	}

	async onCapabilityCleanCountMode(value, opts) {
		if (appdebug) { this.log('onCapabilityCleanCountMode(' + value + ')'); }
		this.vacbot.run('SetCleanCount', Number(value));
	}

	// =======================================================================================================================================================================================
	// FLOW ACTIONS
	// =======================================================================================================================================================================================	

	async flowActionClean() {
		if (appdebug) { this.log('flowActionClean'); }
		this.vacbot.run('Clean');
	}

	async flowActionStop() {
		if (appdebug) { this.log('flowActionStop'); }
		this.vacbot.run('Stop');
	}

	async flowActionCharge() {
		if (appdebug) { this.log('flowActionCharge'); }
		this.vacbot.run('Charge');
	}

	async flowActionPark() {
		if (appdebug) { this.log('flowActionPark'); }
		await this._park();
	}

	async flowActionPauseOn() {
		if (appdebug) { this.log('flowActionPauseOn'); }
		this.vacbot.run('Pause');
	}

	async flowActionPauseOff() {
		if (appdebug) { this.log('flowActionPauseOff'); }
		this.vacbot.run('Resume');
	}

	async flowActionEmptyDustbin() {
		if (appdebug) { this.log('flowActionEmptyDustbin'); }
		this.vacbot.run('EmptyDustbin');
	}

	async flowActionWashMopStart() {
		if (appdebug) { this.log('flowActionWashMopStart'); }
		this.vacbot.run('WashingStart');
	}

	async flowActionWashMopStop() {
		if (appdebug) { this.log('flowActionWashMopStop'); }
		this.vacbot.run('WashingStop');
	}

	async flowActionDryMopStart() {
		if (appdebug) { this.log('flowActionDryMopStart'); }
		this.vacbot.run('AirDryingStart');
	}

	async flowActionDryMopStop() {
		if (appdebug) { this.log('flowActionDryMopStop'); }
		this.vacbot.run('AirDryingStop');
	}

	async flowActionAirdryingOn() {
		if (appdebug) { this.log('flowActionAirdryingOn'); }
		this.vacbot.run('AirDryingStart');
	}

	async flowActionAirdryingOff() {
		if (appdebug) { this.log('flowActionAirdryingOff'); }
		awaitthis.vacbot.run('AirDryingStop');		
	}

	async flowActionWashMopOn() {
		if (appdebug) { this.log('flowActionWashMopOn'); }
		this.vacbot.run('WashingStart');
	}

	async flowActionWashMopOff() {
		if (appdebug) { this.log('flowActionWashMopOff'); }
		this.vacbot.run('WashingStop');		
	}

	async flowActionRawCommand(command) {
		if (appdebug) { this.log('flowActionRawCommand(' + command + ')'); }
		this.vacbot.run(command);
	}

	async flowActionCleanZone(zone) {
		if (appdebug) { this.log('flowActionCleanZone(' + zone + ')'); }
		this.vacbot.run('SpotArea', zone.id.zoneid, 1);
		// await this.vacbot.run('FreeCLean', '1,' + zone.id.zoneid, 1);
	}

	async flowActionCleanZones(args) {
		if (appdebug) { this.log('flowActionCleanZonea(' + args + ')'); }
		const zones = [
			args.zone01?.id.zoneid,
			args.zone02?.id.zoneid,
			args.zone03?.id.zoneid,
			args.zone04?.id.zoneid,
			args.zone05?.id.zoneid
		]
		.filter(id => id != null)
		.join(',');
		this.vacbot.run('SpotArea', zones, 1);
		// await this.vacbot.run('FreeCLean', '1,' + zone.id.zoneid, 1);
	}

	async flowActionSetCleanSpeed(value) {
		if (appdebug) { this.log('flowActionSetFanSpeed(' + value + ')'); }
		this.vacbot.run('SetCleanSpeed', value);		
	}

	async flowActionSetWaterFlowValue(value) {
		if (appdebug) { this.log('flowActionSetWaterFlow(' + value + ')'); }
		this.vacbot.run('SetWaterInfo', null, value, null );		

		if (value <= 20) {
			this.vacbot.run('SetWaterLevel', 1);					
		}
		else if (value <= 30) {
			this.vacbot.run('SetWaterLevel', 2);					
		}
		else if (value <= 40) {
			this.vacbot.run('SetWaterLevel', 3);					
		}
		else  {
			this.vacbot.run('SetWaterLevel', 4);					
		}
	}

	async flowActionSetWaterFlowLevel(level) {
		if (appdebug) { this.log('flowActionSetWaterFlow(' + level + ')'); }
		this.vacbot.run('SetWaterLevel', level);		

		switch (level){
			case 1:
			case '1':
				this.vacbot.run('SetWaterInfo', null, 20, null);
				break;
			case 2:
			case '2':
				this.vacbot.run('SetWaterInfo', null, 30, null);
				break;
			case 3:
			case '3':
				this.vacbot.run('SetWaterInfo', null, 40, null);
				break;
			case 4:
			case '4':
				this.vacbot.run('SetWaterInfo', null, 50, null);
				break;
		}
	}

	async flowActionSetWorkMode(mode) {
		if (appdebug) { this.log('flowActionWorkMode(' + mode + ')'); }
		this.vacbot.run('SetWorkMode', Number(mode));		
	}

	async flowActionSetSweepMode(mode) {
		if (appdebug) { this.log('flowActionSweepMode(' + mode + ')'); }
		this.vacbot.run('SetSweepMode', Number(mode));		
	}

	async flowActionSetCleanCountpMode(mode) {
		if (appdebug) { this.log('flowActionSetCleanCountpMode(' + mode + ')'); }
		this.vacbot.run('SetCleanCount', Number(mode));		
	}

	async flowActionSetMap(map) {
		if (appdebug) { this.log('flowActionSetMap(' + map + ')'); }
		this.vacbot.run('SetMajorMap', map.id);		
	}

	async flowActionGetMapImage(map) {
		if (appdebug) { this.log('flowActionGetMapImage(' + map.id + ' , ' + map.name + ')'); }
		if (this.vacbot.isMapImageSupported() == false) { return; }
		this.vacbot.run('GetMapImage', map.id, "outline");		
		this.vacbot.run('GetMapInfo', map.id);		
		this.vacbot.run("GetMinorMap", map.id, 0);

		this.vacbot.mapManager.liveMapImage.getBase64PNG(
                this.vacbot.deebotPosition, this.vacbot.chargePosition, map.id, this.vacbot.mapManager
            ).then((base64) => { this.emit('mapImage', base64); });
	}


	// =======================================================================================================================================================================================
	// FLOW CONDITIONS
	// =======================================================================================================================================================================================	
	isMapActive(map) {
		this.maps = this.getStoreValue('maps');
		for (const m of this.maps) {
			if (m.mapid == map.id) {
				return m.mapIsCurrentMap;
			}
		}
		return false;
	}

	

	// =======================================================================================================================================================================================
	// FLOW AUTOCOMPLETE
	// =======================================================================================================================================================================================	
	getAutocompleteZoneList(onlyCurrentMap=false){
		let areas = this.getStoreValue('areas');
		let maps = this.getStoreValue('maps');

		let list = [];
		for (const map of maps) {
			for (const area of areas) {
				if (map.mapid == area.mapid) {
					if (onlyCurrentMap && !map.mapIsCurrentMap) { continue; }
					list.push(
						{
							"name": map.name + ' - ' + area.name,
							"id": {
								"id": area.mapid + '-' + area.zoneid,
								"mapid": area.mapid,
								"zoneid": area.zoneid 
							}
						}
					);
				}
			}
		}
		return list;
	}

	getAutocompleteMapList(){
		let maps = this.getStoreValue('maps');
		let list = [];
		for (const map of maps) {
			list.push(
				{
					"name": map.name,
					"id": map.mapid
				}
			);
		}
		return list;
	}

	// =======================================================================================================================================================================================
	// DEEBOT API
	// =======================================================================================================================================================================================	
	async _park(){
		let position = this.getStoreValue('parkPosition');
		if (position == undefined){
			throw new Error('No Park Position defined');
		} 
		position = position.x+','+position.y;
		this.vacbot.run('GoToPosition', position);
	}

	_getMaps(){
		if (appdebug) { this.log('_getMaps()'); } 
		this.vacbot.run('GetMaps', true);
	}

	//////////////////////////////////////////// Utilities ///////////////////////////////////////


	// log() {
	// 	console.log.bind(this, new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60 * 1000)).toLocaleString('en-US', { day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: this.homey.clock.getTimezone(), hour12: false }).replace(',', '') + " [log] [Device]").apply(this, arguments);
	// }

	// error() {
	// 	console.error.bind(this, new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60 * 1000)).toLocaleString('en-US', { day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: this.homey.clock.getTimezone(), hour12: false }).replace(',', '') + " [err] [Device]").apply(this, arguments);
	// }

	// async getCleaningImage(vacbot, imageUrl) {

	// 	const sign = crypto
	// 		.createHash('sha256')
	// 		.update(vacbot.getCryptoHashStringForSecuredContent())
	// 		.digest('hex');

	// 	const headers = {
	// 		'Authorization': `Bearer ${vacbot.user_access_token}`,
	// 		'token': vacbot.user_access_token,
	// 		'appid': 'ecovacs',
	// 		'plat': 'android',
	// 		'userid': vacbot.uid,
	// 		'user-agent': 'EcovacsHome/2.3.7 (Linux; U; Android 5.1.1; A5010 Build/LMY48Z)',
	// 		'v': '2.3.7',
	// 		'country': vacbot.country,
	// 		'sign': sign,
	// 		'signType': 'sha256'
	// 	};

	// 	return new Promise((resolve, reject) => {
	// 		https.get(imageUrl, { headers }, res => {

	// 			const chunks = [];

	// 			res.on('data', chunk => chunks.push(chunk));

	// 			res.on('end', () => {
	// 				const data = Buffer.concat(chunks);

	// 				if (res.statusCode !== 200) {
	// 					return reject(
	// 						new Error(
	// 							`HTTP ${res.statusCode}: ${data.toString()}`
	// 						)
	// 					);
	// 				}

	// 				resolve(data);
	// 			});

	// 		}).on('error', reject);
	// 	});
	// }
}

module.exports = VacuumDevice