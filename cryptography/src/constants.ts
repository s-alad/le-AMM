export function cleanHex(hex: string): string {
  return hex.trim()          // kill \n  \r  \t  spaces
    .replace(/^0x/, '')           // drop 0x
    .toLowerCase();
}


export interface SwapRequest {
  address: string;
  tokenIn: string;
  tokenOut: string;
  amount: string;
}