import { registerFormatters } from './formatters';
import { modalWithCloseButton } from './modals';
import { commafy, formatAllianceName, formatDate } from './formatting';

export function addFormatters() {
    registerFormatters({
        commafy,
        formatDate,
        formatAllianceName,
        modalWithCloseButton,
    });
}
