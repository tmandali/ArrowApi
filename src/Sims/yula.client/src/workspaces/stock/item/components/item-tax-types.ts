export const cellInputClass =
  "h-9 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70";

export const cellClass = "p-0 border-r border-border/60 last:border-r-0";
export const headClass =
  "h-9 px-2 border-r border-border/60 last:border-r-0 text-[11px] font-medium text-muted-foreground bg-muted/30";

export const itemTaxTemplateOptions = [
  "UAE Excise 100% - NGH",
  "UAE VAT 5%",
  "UAE Zero Rated",
  "UAE Exempt",
];

export const taxCategoryOptions = [
  "In-State",
  "Out-State",
  "Registered Composition",
  "Reverse Charge In-State",
  "Reverse Charge Out State",
];

export type TaxRow = {
  id: string;
  selected: boolean;
  itemTaxTemplate: string;
  taxCategory: string;
  validFrom: string;
  minimumNetRate: string;
  maximumNetRate: string;
};

export const emptyRow = (): TaxRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  selected: false,
  itemTaxTemplate: "",
  taxCategory: "",
  validFrom: "",
  minimumNetRate: "0.000",
  maximumNetRate: "0.000",
});

export const initialRows: TaxRow[] = [
  {
    id: "1",
    selected: false,
    itemTaxTemplate: "UAE Excise 100% - NGH",
    taxCategory: "",
    validFrom: "",
    minimumNetRate: "",
    maximumNetRate: "",
  },
  {
    id: "2",
    selected: false,
    itemTaxTemplate: "UAE Excise 100% - NGH",
    taxCategory: "",
    validFrom: "",
    minimumNetRate: "0.000",
    maximumNetRate: "0.000",
  },
  {
    id: "3",
    selected: false,
    itemTaxTemplate: "UAE Excise 100% - NGH",
    taxCategory: "",
    validFrom: "",
    minimumNetRate: "0.000",
    maximumNetRate: "0.000",
  },
  {
    id: "4",
    selected: false,
    itemTaxTemplate: "",
    taxCategory: "",
    validFrom: "",
    minimumNetRate: "0.000",
    maximumNetRate: "0.000",
  },
];

export const EDITABLE_COL_COUNT = 5;
