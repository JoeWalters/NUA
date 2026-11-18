export function convertDigitsToDOW(digits) {
    const mapToDays = digits.split("").map((digitDay) => {
        switch (digitDay) {
            case "0":
                return "Su";
            case "1":
                return "M";
            case "2":
                return "T";
            case "3":
                return "W";
            case "4":
                return "Th";
            case "5":
                return "F";
            case "6":
                return "Sa";
            default:
                return "";
        }
    });
    return mapToDays;
}