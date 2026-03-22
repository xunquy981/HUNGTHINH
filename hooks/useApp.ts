import { useAppContext as useBaseAppContext } from '../contexts/AppContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { useDomainServices } from './useDomainServices';

export const useApp = () => {
    const appContext = useBaseAppContext();
    const settingsContext = useSettings();
    const notificationContext = useNotification();
    const domainServices = useDomainServices();

    return {
        ...appContext,
        ...settingsContext,
        ...notificationContext,
        ...domainServices
    };
};
