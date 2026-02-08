import { Chain, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type WalletChainClientInput = {
  rpcUrl: string;
  chainId: number;
  privateKey: `0x${string}`;
};

export function createWalletChainClient(input: WalletChainClientInput) {
  const chain: Chain = {
    id: input.chainId,
    name: `chain-${input.chainId}`,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: { http: [input.rpcUrl] },
      public: { http: [input.rpcUrl] }
    }
  };

  const transport = http(input.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const account = privateKeyToAccount(input.privateKey);
  const walletClient = createWalletClient({ account, chain: publicClient.chain, transport });

  return { publicClient, walletClient };
}
