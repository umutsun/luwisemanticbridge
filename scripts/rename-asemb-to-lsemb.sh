#!/bin/bash

echo "🔄 Renaming all asemb references to lsemb..."

# Change in backend src files
find backend/src -name "*.ts" -type f -exec sed -i 's/asembPool/lsembPool/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asembDatabase/lsembDatabase/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asemb_system/lsemb_system/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asemb_client/lsemb_client/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asemb_api/lsemb_api/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asemb_api_key/lsemb_api_key/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asemb_settings/lsemb_settings/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asemb_logs/lsemb_logs/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asemb_users/lsemb_users/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/ASemb/LSEMB/g' {} \;
find backend/src -name "*.ts" -type f -exec sed -i 's/asemb/lsemb/g' {} \;

# Change in backend scripts
find backend/scripts -name "*.ts" -type f -exec sed -i 's/asembPool/lsembPool/g' {} \;
find backend/scripts -name "*.ts" -type f -exec sed -i 's/asemb/lsemb/g' {} \;

# Change in backend routes
find backend/routes -name "*.ts" -type f -exec sed -i 's/asembPool/lsembPool/g' {} \;
find backend/routes -name "*.ts" -type f -exec sed -i 's/asemb/lsemb/g' {} \;

# Change in backend services
find backend/services -name "*.ts" -type f -exec sed -i 's/asembPool/lsembPool/g' {} \;
find backend/services -name "*.ts" -type f -exec sed -i 's/asemb/lsemb/g' {} \;

# Change database name references in strings
find backend -name "*.ts" -type f -exec sed -i "s/'asemb'/'lsemb'/g" {} \;
find backend -name "*.ts" -type f -exec sed -i 's/"asemb"/"lsemb"/g' {} \;
find backend -name "*.ts" -type f -exec sed -i 's/asemb\.db/lsemb\.db/g' {} \;

echo "✅ Renamed all asemb to lsemb in backend"

# Change in frontend
find frontend/src -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | xargs grep -l "asemb" | while read file; do
  sed -i 's/asemb/lsemb/g' "$file"
  sed -i 's/ASemb/LSEMB/g' "$file"
done

echo "✅ Renamed all asemb to lsemb in frontend"

# Change in config files
find . -name "*.env*" -o -name "*.json" -o -name "*.md" | grep -v node_modules | while read file; do
  if grep -q "asemb" "$file"; then
    echo "Updating $file"
    sed -i 's/asemb/lsemb/g' "$file"
    sed -i 's/ASEMB/LSEMB/g' "$file"
  fi
done

echo "✅ Renamed all asemb to lsemb in config files"
echo "🎉 All references updated!"