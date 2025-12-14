-- Enable RLS on players table
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- ポリシー作成: 自分のプロフィールのみ更新可能にする
-- column "user_id" does not exist -> assuming "id" is the PK linked to auth.uid()
CREATE POLICY "Users can update own profile" 
ON players 
FOR UPDATE 
USING (auth.uid() = id);

-- 読み取りは全員許可
CREATE POLICY "Public profiles are viewable by everyone" 
ON players 
FOR SELECT 
USING (true);
