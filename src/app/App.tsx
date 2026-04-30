/** @jsxImportSource @emotion/react */
import { useCallback, useState } from 'react';
import AuthPage from '@modules/auth/AuthPage';
import DashboardPage, { type DashboardSection } from '@modules/dashboard/DashboardPage';
import GroupsPage from '@modules/passwords/GroupsPage';
import GroupTablePage from '@modules/passwords/GroupTablePage';
import FinancePage from '@modules/finance/FinancePage';
import { Starfield } from '@shared/components/Starfield';
import { api } from '@shared/api';
import { useAutoLock } from '@shared/hooks/useAutoLock';
import type { GroupSummary } from '@shared/types';

type Route =
    | { name: 'auth' }
    | { name: 'dashboard' }
    | { name: 'groups'; section: DashboardSection }
    | { name: 'group-table'; group: GroupSummary }
    | { name: 'finance' };

const AUTO_LOCK_MS = 60_000;

function App() {
    const [route, setRoute] = useState<Route>({ name: 'auth' });

    const lock = useCallback(() => {
        void api.lock();
        setRoute({ name: 'auth' });
    }, []);

    useAutoLock(route.name !== 'auth', AUTO_LOCK_MS, lock);

    return (
        <>
            <Starfield />
            {route.name === 'auth' && (
                <AuthPage onUnlocked={() => setRoute({ name: 'dashboard' })} />
            )}
            {route.name === 'dashboard' && (
                <DashboardPage
                    onSelect={(section) => {
                        if (section === 'passwords') setRoute({ name: 'groups', section });
                        else if (section === 'finance') setRoute({ name: 'finance' });
                    }}
                    onLock={lock}
                />
            )}
            {route.name === 'groups' && (
                <GroupsPage
                    onBack={() => setRoute({ name: 'dashboard' })}
                    onOpenGroup={(g) => setRoute({ name: 'group-table', group: g })}
                />
            )}
            {route.name === 'group-table' && (
                <GroupTablePage
                    group={route.group}
                    onBack={() => setRoute({ name: 'groups', section: 'passwords' })}
                />
            )}
            {route.name === 'finance' && (
                <FinancePage
                    onBack={() => setRoute({ name: 'dashboard' })}
                    onLock={lock}
                />
            )}
        </>
    );
}

export default App;
