import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UserRole, type PublicUser } from '@samou-go/shared-types';
import { CaptainStoreAssignment } from '../../web-admin/src/components/StoreAssignmentPicker';
import '../src/index.css';
declare global { var multiStoreSaved: string[] | undefined; }
const initial: PublicUser = { id: 'qa', name: 'كابتن تجريبي', phone: '0590000000', role: UserRole.CAPTAIN, isActive: true, isVerified: true, isAvailable: true, assignedStoreId: 'a', assignedStoreIds: ['a'], profileImageUrl: null, latitude: null, longitude: null, createdAt: '', updatedAt: '' };
function Preview() {
  const [user, setUser] = useState(initial);
  return <main className="mx-auto max-w-md p-4"><section className="card-surface space-y-4 p-5"><h1 className="text-xl font-bold">تخصيص متاجر الكابتن</h1><p>{user.name}</p><CaptainStoreAssignment user={user} stores={[{ id: 'a', nameAr: 'مطعم السموع' }, { id: 'b', nameAr: 'حلويات البلد' }, { id: 'c', nameAr: 'سوبرماركت البركة' }]} onSave={async ids => { globalThis.multiStoreSaved = ids; setUser({ ...user, assignedStoreIds: ids, assignedStoreId: ids[0] ?? null }); }} /></section></main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
