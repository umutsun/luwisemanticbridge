import time
import sys

print("Script started")
sys.stdout.flush()

for i in range(1, 11):
    print(f"Processing item {i} of 10")
    sys.stdout.flush()
    time.sleep(1)

print("Script completed successfully")
sys.stdout.flush()
