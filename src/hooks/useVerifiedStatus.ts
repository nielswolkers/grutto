import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Cache for verified user IDs and group IDs
let verifiedUserIds: string[] | null = null;
let verifiedGroupIds: string[] | null = null;

export function useVerifiedUsers() {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVerifiedUsers = async () => {
      if (verifiedUserIds !== null) {
        setUserIds(verifiedUserIds);
        setLoading(false);
        return;
      }

      try {
        // Get the first 10 registered users
        const { data } = await supabase
          .from('profiles')
          .select('user_id')
          .order('created_at', { ascending: true })
          .limit(10);

        const ids = data?.map(p => p.user_id) || [];
        verifiedUserIds = ids;
        setUserIds(ids);
      } catch (error) {
        console.error('Failed to load verified users:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVerifiedUsers();
  }, []);

  return { verifiedUserIds: userIds, loading };
}

export function useVerifiedGroups() {
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVerifiedGroups = async () => {
      if (verifiedGroupIds !== null) {
        setGroupIds(verifiedGroupIds);
        setLoading(false);
        return;
      }

      try {
        // Get the first 10 registered groups
        const { data } = await supabase
          .from('study_groups')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(10);

        const ids = data?.map(g => g.id) || [];
        verifiedGroupIds = ids;
        setGroupIds(ids);
      } catch (error) {
        console.error('Failed to load verified groups:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVerifiedGroups();
  }, []);

  return { verifiedGroupIds: groupIds, loading };
}

export function isUserVerified(userId: string): boolean {
  return verifiedUserIds?.includes(userId) ?? false;
}

export function isGroupVerified(groupId: string): boolean {
  return verifiedGroupIds?.includes(groupId) ?? false;
}
