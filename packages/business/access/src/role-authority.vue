<!--
 Access control component for fine-grained access control.
-->
<script lang="ts" setup>
import { useAccess } from './use-access';

interface Props {
  /**
   * Specified role is visible
   * @default []
   */
  roles?: string[];
}

defineOptions({
  name: 'RoleAuthority',
});

withDefaults(defineProps<Props>(), {
  roles: undefined,
});

const { hasAuthByRole } = useAccess();
</script>

<template>
  <slot v-if="!roles"></slot>
  <slot v-else-if="hasAuthByRole(roles)"></slot>
</template>
