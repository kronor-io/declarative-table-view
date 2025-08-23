import React from "react";
import { FlexRow } from "../../../components/LayoutHelpers";

type PaymentMethodEnum =
    | "SWISH"
    | "MOBILEPAY"
    | "VIPPS"
    | "PAYPAL"
    | "CREDIT_CARD"
    | "P24"
    | "DIRECT_DEBIT"
    | "BANK_TRANSFER"
    | string;


interface Props {
    cardType: string[]
    paymentMethod?: PaymentMethodEnum;
    darkmode: boolean;
}

const bankTransferLogo = (darkmode: boolean) =>
    `https://staging.kronor.io/portal/static/assets/img/logos/${darkmode ? "light-" : ""}bank-transfer-donated-by-axel.svg`;

const cardImage = (scheme: string) => {
    switch (scheme.toLowerCase()) {
        case "visa":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/Visa_Brandmark_Blue_RGB_2021.svg" width="65px" alt="Visa" title="Visa" />
                    Visa
                </FlexRow>
            );
        case "mc":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/mc_symbol.svg" width="55px" alt="Mastercard" title="Mastercard" />
                    Mastercard
                </FlexRow>
            );
        case "dankort":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/DK_Logo_CMYK.png" width="55px" alt="Dankort" title="Dankort" />
                    Dankort
                </FlexRow>
            );
        case "visa_dk":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/DK_Logo_CMYK.png" width="55px" alt="Visa Dankort" title="Visa Dankort" />
                    Visa&nbsp;Dankort
                </FlexRow>
            );
        case "visa_elec":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/vbm_elec_pos_blu_2021.png" width="45px" alt="Visa Electron" title="Visa Electron" />
                    Visa&nbsp;Electron
                </FlexRow>
            );
        case "amex":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/amex_80x80.svg" width="55px" alt="American Express" title="American Express" />
                    American&nbsp;Express
                </FlexRow>
            );
        case "maestro":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/maestro.svg" width="55px" alt="Maestro" title="Maestro" />
                    Maestro
                </FlexRow>
            );
        case "jcb":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/jcb_67x86.gif" width="55px" alt="JCB" title="JCB" />
                    JCB
                </FlexRow>
            );
        case "discover":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/discover.png" width="55px" alt="Discover" title="Discover" />
                    Discover
                </FlexRow>
            );
        case "ffk":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/ffk.svg" width="55px" alt="Forbrugsforeningen" title="Forbrugsforeningen" />
                    Forbrugsforeningen
                </FlexRow>
            );
        case "diners":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/diners_logo_stacked_dark.svg" width="55px" alt="Diners Club" title="Diners Club" />
                    Diners&nbsp;Club
                </FlexRow>
            );
        case "china_union_pay":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/china_union_pay.png" width="55px" alt="China Union Pay" title="China Union Pay" />
                    China&nbsp;Union&nbsp;Pay
                </FlexRow>
            );
        default:
            return <>CREDIT CARD</>;
    }
};

export const PaymentMethod: React.FC<Props> = ({ cardType, paymentMethod, darkmode }) => {
    switch (paymentMethod) {
        case "SWISH":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/swish.png" width="32px" alt="Swish" title="Swish" />
                    Swish
                </FlexRow>
            );
        case "MOBILEPAY":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/mobilepay.png" width="32px" alt="MobilePay" title="MobilePay" />
                    MobilePay
                </FlexRow>
            );
        case "VIPPS":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/vipps.svg" width="32px" alt="Vipps" title="Vipps" />
                    Vipps
                </FlexRow>
            );
        case "PAYPAL":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/paypal.png" width="24px" alt="PayPal" title="PayPal" />
                    PayPal
                </FlexRow>
            );
        case "CREDIT_CARD":
            if (cardType.length === 0) {
                return <FlexRow align="center" justify="center">CREDIT CARD</FlexRow>;
            }
            return <FlexRow align="center" justify="center">{cardImage(cardType[0])}</FlexRow>;

        case "P24":
            return (
                <FlexRow align="center" justify="center">
                    <img src="https://staging.kronor.io/portal/static/assets/img/logos/Przelewy24_logo.svg" width="32px" alt="Przelewy24" title="Przelewy24" />
                    P24
                </FlexRow>
            );
        case "DIRECT_DEBIT":
            return (
                <FlexRow align="center" justify="center">
                    <img src={bankTransferLogo(darkmode)} width="32px" alt="Direct Debit" title="Direct Debit" />
                    Direct Debit
                </FlexRow>
            );
        case "BANK_TRANSFER":
            return (
                <FlexRow align="center" justify="center">
                    <img src={bankTransferLogo(darkmode)} width="32px" alt="Bank Transfer" title="Bank Transfer" />
                    Bank Transfer
                </FlexRow>
            );
        default:
            return <>UNKNOWN</>;
    }
};
