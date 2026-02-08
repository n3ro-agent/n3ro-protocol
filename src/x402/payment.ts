import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import * as evmExactServer from "@x402/evm/exact/server";
import * as svmExactServer from "@x402/svm/exact/server";
import { AppConfig } from "../config/env";

export function createTradePaymentMiddleware(config: AppConfig["x402"]) {
  const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitator);
  const evmNetworks = config.payments.filter((payment) => payment.chain === "evm").map((payment) => payment.network);
  const solanaNetworks = config.payments
    .filter((payment) => payment.chain === "solana")
    .map((payment) => payment.network);

  if (evmNetworks.length > 0) {
    registerExactScheme(resourceServer, evmExactServer, "EVM", evmNetworks, [
      "registerExactEvmScheme",
      "registerExactEVMScheme"
    ], ["ExactEvmScheme", "ExactEVMScheme"]);
  }

  if (solanaNetworks.length > 0) {
    registerExactScheme(
      resourceServer,
      svmExactServer,
      "Solana",
      solanaNetworks,
      ["registerExactSvmScheme", "registerExactSVMScheme"],
      ["ExactSvmScheme", "ExactSVMScheme"]
    );
  }

  return paymentMiddleware(
    {
      "POST /trade/execute": {
        accepts: config.payments.map((payment) => ({
          scheme: "exact",
          network: payment.network,
          amount: payment.amount,
          payTo: payment.payTo,
          asset: payment.asset,
          maxTimeoutSeconds: config.maxTimeoutSeconds,
          description: "Execute a trade via agent",
          mimeType: "application/json"
        }))
      }
    },
    resourceServer
  );
}

function registerExactScheme(
  resourceServer: unknown,
  schemeModule: Record<string, unknown>,
  label: string,
  networks: string[],
  registerCandidates: string[],
  constructorCandidates: string[]
): void {
  const registerFn = findFunctionExport(schemeModule, registerCandidates);
  if (registerFn) {
    registerFn(resourceServer);
    return;
  }

  const SchemeConstructor = findConstructorExport(schemeModule, constructorCandidates);
  if (SchemeConstructor) {
    const register = getServerRegister(resourceServer, label);
    for (const network of networks) {
      register(network, new SchemeConstructor());
    }
    return;
  }

  throw new Error(`Unsupported @x402 ${label} exact server module. Missing register helper and scheme constructor`);
}

function findFunctionExport(
  moduleExports: Record<string, unknown>,
  candidates: string[]
): ((server: unknown) => void) | undefined {
  for (const key of candidates) {
    const value = moduleExports[key];
    if (typeof value === "function") {
      return value as (server: unknown) => void;
    }
  }
  return undefined;
}

function findConstructorExport(
  moduleExports: Record<string, unknown>,
  candidates: string[]
): (new () => unknown) | undefined {
  for (const key of candidates) {
    const value = moduleExports[key];
    if (typeof value === "function") {
      return value as new () => unknown;
    }
  }
  return undefined;
}

function getServerRegister(
  server: unknown,
  label: string
): (network: string, scheme: unknown) => unknown {
  const register = (server as { register?: unknown }).register;
  if (typeof register !== "function") {
    throw new Error(`x402 resource server is missing register() while configuring ${label} exact scheme`);
  }

  return register as (network: string, scheme: unknown) => unknown;
}
