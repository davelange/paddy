import type {
	AuthenticationResponseJSON,
	AuthenticatorTransportFuture,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { getOrigin, getRpId } from "../server/network";

const RP_NAME = "paddy";

export async function buildRegistrationOptions(
	userHandle: Uint8Array,
	userName: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
	return generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: getRpId(),
		userName,
		userID: userHandle.slice(),
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

export async function buildAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
	return generateAuthenticationOptions({
		rpID: getRpId(),
		userVerification: "preferred",
	});
}

export async function verifyAuthentication(
	response: AuthenticationResponseJSON,
	expectedChallenge: string,
	credential: {
		id: string;
		publicKey: Uint8Array;
		counter: number;
		transports?: AuthenticatorTransportFuture[];
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
			transports: credential.transports,
		},
		requireUserVerification: false,
	});
}
