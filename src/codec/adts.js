/**
 * @file: adts.js, created at Monday, 23rd December 2019 3:47:23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */

/**
 * ADTS codec
 * Wiki Refer: https://wiki.multimedia.cx/index.php?title=ADTS
 */
import EventEmitter from '../util/event-emitter';

const ADTS_SAMPLING_FREQUENCIES = [
	96000,
	88200,
	64000,
	48000,
	44100,
	32000,
	24000,
	22050,
	16000,
	12000,
	11025,
	8000,
	7350
];

/**
 * @extends EventEmitter
 */
class ADTSCodec extends EventEmitter {
	constructor() {
		super();
	}

	push(data) {
		let pesPacket = data.pes;
		let pts = pesPacket.PTS,
			dts = pesPacket.DTS;
		let pes_data_byte = pesPacket.data_byte;
		let data_byte;
		let i = 0,
			frameNum = 0,
			frameLength,
			protectionSkipBytes,
			frameEnd,
			sampleCount,
			adtsFrameDuration;

		data_byte = pes_data_byte;

		while (i + 5 < data_byte.length) {
			// Look for the start of an ADTS header..
			if (data_byte[i] !== 0xff || (data_byte[i + 1] & 0xf6) !== 0xf0) {
				// If a valid header was not found,  jump one forward and attempt to
				// find a valid ADTS header starting at the next byte
				i++;
				continue;
			}

			// The protection skip bit tells us if we have 2 bytes of CRC data at the
			// end of the ADTS header
			protectionSkipBytes = (~data_byte[i + 1] & 0x01) * 2;

			// Frame length is a 13 bit integer starting 16 bits from the
			// end of the sync sequence
			frameLength =
				((data_byte[i + 3] & 0x03) << 11) | (data_byte[i + 4] << 3) | ((data_byte[i + 5] & 0xe0) >> 5);

			sampleCount = ((data_byte[i + 6] & 0x03) + 1) * 1024;
			adtsFrameDuration = (sampleCount * 90000) / ADTS_SAMPLING_FREQUENCIES[(data_byte[i + 2] & 0x3c) >>> 2];

			frameEnd = i + frameLength;

			// If we don't have enough data to actually finish this ADTS frame, return
			// and wait for more data
			if (data_byte.byteLength < frameEnd) {
				return;
			}

			// Otherwise, deliver the complete AAC frame
			this.emit('frame', {
				pts: pts + frameNum * adtsFrameDuration,
				dts: dts + frameNum * adtsFrameDuration,
				sampleCount: sampleCount,
				audioObjectType: ((data_byte[i + 2] >>> 6) & 0x03) + 1,
				channelCount: ((data_byte[i + 2] & 1) << 2) | ((data_byte[i + 3] & 0xc0) >>> 6),
				sampleRate: ADTS_SAMPLING_FREQUENCIES[(data_byte[i + 2] & 0x3c) >>> 2],
				samplingFrequencyIndex: (data_byte[i + 2] & 0x3c) >>> 2,
				// assume ISO/IEC 14496-12 AudioSampleEntry default of 16
				sampleSize: 16,
				data: data_byte.subarray(i + 7 + protectionSkipBytes, frameEnd)
			});

			// If the data_byte is empty, clear it and return
			if (data_byte.byteLength === frameEnd) {
				data_byte = undefined;

				this.emit('done');
				return;
			}

			frameNum++;

			// Remove the finished frame from the data_byte and start the process again
			data_byte = data_byte.subarray(frameEnd);
		}
	}
}

export default ADTSCodec;
