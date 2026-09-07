'use strict';

const { Driver }	= require('homey');

const crypto = require('crypto');
const tools = require('../../lib/tools');
const ecovacsApi = require('../../lib/ecovacsApi');
let continent;

const VacuumDevice = require('./device');
class VacuumDriver extends Driver {

	async onInit() {
		this.log('Driver Vacuum has been initialized');
		this.log('appdebug: ' + appdebug)
	}

	onMapDeviceClass(device) {
		return VacuumDevice;
	}

	async onPair(session) {
		this.accountData = {
			email: '',
			password: '',
			deviceId: await this.createDeviceId()
		};

		this.deviceApi = null; 

		session.setHandler("accountChanged", async (data) => {
            return await this.onAccountChanged(data);
        });

        session.setHandler("getAccount", async () => {
            this.log("getAccount:");
            if (process.env.DEBUG === '1'){
                this.log(this.accountData);
            }
            return this.accountData;
        });

		session.setHandler("pincode", async (pincode) => {
            return await this.onPincode(session, pincode);
		});

         session.setHandler('showView', async (view) => {
            return await this.onShowView(session, view);
        });

		session.setHandler("list_devices", async () => {
			return await this.onListDevices(session);
		});
	}

	async onRepair(session, device) {
		this.log('Repairing'); 

		this.accountData = {
			email: '',
			password: '',
			deviceId: await this.createDeviceId() //device.getStoreValue('deviceId')
		};
		if (device.getStoreValue('email')) {
			this.accountData.email = device.getStoreValue('email');
		}
		if (device.getStoreValue('password')) {
			this.accountData.password = device.getStoreValue('password');
		}
		// if (typeof this.accountData.deviceId != 'string' || this.accountData.deviceId.length == 0) {
		// 	this.accountData.deviceId = await this.createDeviceId();
		// }

		this.deviceApi = null; 

		session.setHandler("accountChanged", async (data) => {
            return await this.onAccountChanged(data);
        });

        session.setHandler("getAccount", async () => {
            this.log("getAccount:");
            if (process.env.DEBUG === '1'){
                this.log(this.accountData);
            }
            return this.accountData;
        });

		session.setHandler("pincode", async (pincode) => {
            return await this.onPincode(session, pincode);
		});

         session.setHandler('showView', async (view) => {
            return await this.onShowView(session, view);
        });

		session.setHandler("list_devices", async () => {
			return await this.onUpdateDevice(session, device);
		});

	}

	async onAccountChanged(data){
        this.log("onAccountChanged()");
        if (process.env.DEBUG === '1'){
            this.log(data);
        }
        if (data.email){
            this.accountData.email = data.email;
        }
        if (data.password){
            this.accountData.password = data.password;
        }
        return true;
    }

	async onPincode(session, pincode){
        this.log("onPincode()");
		// The pincode is given as an array of the filled in values
		let code = pincode.join("");
		try{
			await this.deviceApi.verifyDevice(code);
			return true;
		}
		catch (error){
			this.log(error);
			this.log('Invalid or expired code - please try again.');
			throw error;
		}
	}

	async onShowView(session, view){
		if (view === 'check_account') {
			this.log("onShowView(check_account), deviceId: " + this.accountData.deviceId + ", email: " + this.accountData.email);

			try{
				this.deviceApi = await ecovacsApi.getApi(this.accountData.deviceId);
				await this.deviceApi.connect(this.accountData.email, ecovacsApi.getPasswordHash(this.accountData.password));
				await session.showView("list_devices");
			}
			catch(error){
				if (!(error.name === 'DeviceVerificationRequired')) {
					await session.showView("account_error");
				}
				else{
					await this.deviceApi.requestDeviceVerificationCode();
					await session.showView("pincode");
				}
			}
		}
	}

	async onListDevices(){
		let devicesList = await this.deviceApi.devices();
		this.log('onListDevices(): Deebot devices: ' + JSON.stringify(devicesList));
		let devices = devicesList
			.filter((device) => device.product_category === 'DEEBOT')
			.map((device) => {
				return {
					name: device.deviceName,
					data: {
						id: device.did
					},
					store: {
						deviceId: this.accountData.deviceId,
						api: this.deviceApi,
						geo: this.deviceApi.continent,
						vacuum: device,
						email: this.accountData.email,
						password: this.accountData.password
					}
				};
			});
		return devices;
	}

	async onUpdateDevice(session, device){
		device.setStoreValue('email', this.accountData.email);
		device.setStoreValue('password', this.accountData.password);
		device.setStoreValue('deviceId', this.accountData.deviceId);
		device.onInit();
		await session.done();
	}


	async createDeviceId(){
		// return await this.homey.cloud.getHomeyId();
		return ecovacsApi.getDeviceId( await this.homey.cloud.getHomeyId() );
	}

	log() {
		console.log.bind(this, new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60 * 1000)).toLocaleString('en-US', { day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: this.homey.clock.getTimezone(), hour12: false }).replace(',', '') + " [log] [Driver]").apply(this, arguments);
	}

	error() {
		console.error.bind(this, new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60 * 1000)).toLocaleString('en-US', { day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: this.homey.clock.getTimezone(), hour12: false }).replace(',', '') + " [err] [Driver]").apply(this, arguments);
	}

}

module.exports = VacuumDriver;

