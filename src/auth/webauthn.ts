import {
	type AuthenticationResponseJSON,
	generateAuthenticationOptions,
	generateRegistrationOptions,
	type RegistrationResponseJSON,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { generateUserID } from "@simplewebauthn/server/helpers";
import { getOrigin, getRpId } from "../server/network";

const RP_NAME = "paddy";

export async function buildRegistrationOptions() {
	const userID = await generateUserID();

	return generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: getRpId(),
		userName: "paddy device",
		userID,
		attestationType: "none",
		authenticatorSelection: {
			residentKey: "required",
			userVerification: "preferred",
		},
	});
}

export async function verifyRegistration(
	response: RegistrationResponseJSON,
	expectedChallenge: string,
	port: number,
) {
	return verifyRegistrationResponse({
		response,
		expectedChallenge,
		expectedOrigin: getOrigin(port),
		expectedRPID: getRpId(),
		requireUserVerification: false,
	});
}

export async function buildAuthenticationOptions(challenge: string) {
	return generateAuthenticationOptions({
		rpID: getRpId(),
		userVerification: "preferred",
		challenge,
	});
}

export async function verifyAuthentication(
	response: AuthenticationResponseJSON,
	expectedChallenge: string,
	credential: {
		id: string;
		publicKey: Uint8Array;
		counter: number;
	},
	port: number,
) {
	return verifyAuthenticationResponse({
		response,
		expectedChallenge,
		expectedOrigin: getOrigin(port),
		expectedRPID: getRpId(),
		credential: {
			id: credential.id,
			publicKey: credential.publicKey.slice(),
			counter: credential.counter,
		},
		requireUserVerification: false,
	});
}
