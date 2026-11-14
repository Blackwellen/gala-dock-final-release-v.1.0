-- Q55 exercise (rolled back): map_el_seats subtracts blocked chairs for tables as it already did for seat blocks; never below zero;
-- unflagged and non-seat elements unchanged. Ends with EXERCISE_OK.
do $$
begin
  if public.map_el_seats('{"seating":{"rows":2,"cols":5},"seatFlags":{"A-A-1":"blocked","A-A-2":"accessible"}}') <> 9 then raise exception 'seat block: blocked seat not subtracted'; end if;
  if public.map_el_seats('{"table":{"seats":10},"seatFlags":{"T1-1":"blocked","T1-2":"blocked","T1-3":"companion"}}') <> 8 then raise exception 'table: blocked chairs not subtracted'; end if;
  if public.map_el_seats('{"table":{"seats":10}}') <> 10 then raise exception 'table without flags changed'; end if;
  if public.map_el_seats('{"table":{"seats":1},"seatFlags":{"T1-1":"blocked","T1-2":"blocked"}}') <> 0 then raise exception 'table count went below zero'; end if;
  if public.map_el_seats('{"table":{"seats":4},"seatFlags":"bad"}') <> 4 then raise exception 'non-object flags not ignored'; end if;
  if public.map_el_seats('{"type":"asset","asset":"bar"}') <> 0 then raise exception 'non-seat element counted'; end if;
  raise exception 'EXERCISE_OK map_el_seats tables subtract blocked chairs';
end $$;
