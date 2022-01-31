declare type tzOffsetTitle = {
    offset: number;
    title: string;
};
declare type tzInformation = {
    [abbr: string]: Array<tzOffsetTitle>;
};
declare const tzInfo: tzInformation;
declare const defaultTZ: Record<string, number>;
export { tzInfo, defaultTZ };
