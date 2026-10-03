import { create } from 'zustand';
import { message } from 'antd';
import { configApi, type ConfigResponse } from '@/api';
import { mergeConfig, type AppConfig } from '@smg/shared';

type ConfigStore = {
  config: ConfigResponse | null;
  loading: boolean;
  load: (silent?: boolean) => Promise<void>;
  patch: (patch: Parameters<typeof configApi.save>[0]) => Promise<void>;
  reset: () => Promise<void>;
  ready: boolean;
};

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: null,
  loading: false,
  ready: false,

  load: async (silent = false) => {
    if (!silent) set({ loading: true });
    try {
      const config = await configApi.get();
      set({ config, loading: false, ready: true });
    } catch (err) {
      set({ loading: false, ready: true });
      if (!silent) message.error((err as Error).message);
    }
  },

  patch: async (patch) => {
    const current = get().config;
    if (!current) return;
    // 乐观更新
    const merged = mergeConfig(current as AppConfig, patch) as ConfigResponse;    set({ config: merged });
    try {
      await configApi.save(patch);
    } catch (err) {
      message.error(`保存失败：${(err as Error).message}`);
      await get().load(true);
    }
  },

  reset: async () => {
    try {
      await configApi.reset();
      await get().load(true);
      message.success('已恢复默认配置');
    } catch (err) {
      message.error((err as Error).message);
    }
  },
}));
