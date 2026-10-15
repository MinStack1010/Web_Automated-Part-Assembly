declare module "npyjs" {
  interface NpyData {
    data: ArrayLike<number>;
    shape: number[];
    dtype: string;
  }
  export default class NpyJs {
    load(url: string): Promise<NpyData>;
  }
}
