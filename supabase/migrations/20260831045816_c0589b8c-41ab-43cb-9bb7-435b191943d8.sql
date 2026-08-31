drop policy if exists "Owner or agent can insert chatbot configs" on public.chatbot_configs;
drop policy if exists "Owner or agent can update chatbot configs" on public.chatbot_configs;
drop policy if exists "Owner or agent can delete chatbot configs" on public.chatbot_configs;

create policy "Owner or agent can insert chatbot configs"
on public.chatbot_configs for insert to authenticated
with check (
  can_manage_chatbot_account(whatsapp_account_id)
  and team_member_can_write(auth.uid())
  and (
    can_edit_owner_chatbot(whatsapp_account_id)  -- owner/admin can create any bot on their account
    or agent_user_id = auth.uid()                -- agent creates only their own bot
  )
);

create policy "Owner or agent can update chatbot configs"
on public.chatbot_configs for update to authenticated
using (
  can_manage_chatbot_account(whatsapp_account_id)
  and team_member_can_write(auth.uid())
  and (
    can_edit_owner_chatbot(whatsapp_account_id)
    or agent_user_id = auth.uid()
  )
)
with check (
  can_manage_chatbot_account(whatsapp_account_id)
  and team_member_can_write(auth.uid())
  and (
    can_edit_owner_chatbot(whatsapp_account_id)
    or agent_user_id = auth.uid()
  )
);

create policy "Owner or agent can delete chatbot configs"
on public.chatbot_configs for delete to authenticated
using (
  can_manage_chatbot_account(whatsapp_account_id)
  and team_member_can_write(auth.uid())
  and (
    can_edit_owner_chatbot(whatsapp_account_id)
    or agent_user_id = auth.uid()
  )
);